/*
 * File     : siebel/custom/BatchClient.js
 * Purpose  : Reusable helper used by any PM/PR to call "XX Batch Orchestrator" with ONE network call.
 *
 * Register it in Manifest Administration (UI Objects + Files) or load it as a dependency
 * from your PM (see AccountSummaryPM.js).
 */
define("siebel/custom/BatchClient", [], function () {

	var BATCH_BS = "XX Batch Orchestrator";

	function newPS(type) {
		var ps = SiebelApp.S_App.NewPropertySet();
		if (type) { ps.SetType(type); }
		return ps;
	}

	// Builds one "Step" property set.
	//   inputProps   plain object {"Prop": "value"}  (values may contain ${Step.Prop} references)
	//   stopOnError  "Y" | "N" | undefined
	function newStep(name, service, method, inputProps, stopOnError) {
		var step = newPS("Step");
		step.SetProperty("Name", name);
		step.SetProperty("Service", service);
		step.SetProperty("Method", method);
		if (stopOnError) { step.SetProperty("StopOnError", stopOnError); }

		var inputs = newPS("Inputs");
		var k;
		for (k in (inputProps || {})) {
			if (inputProps.hasOwnProperty(k)) { inputs.SetProperty(k, inputProps[k]); }
		}
		step.AddChild(inputs);          // AddChild stores a copy, so inputs was filled first
		return step;
	}

	// Open UI normally wraps the service response in a "ResultSet" child. Unwrap it if present.
	// (Log the raw response once in your version to confirm.)
	function unwrap(out) {
		if (out && out.GetChildCount() > 0 && out.GetChild(0).GetType() === "ResultSet") {
			return out.GetChild(0);
		}
		return out;
	}

	// Returns the "Output" property set of a named step, or null.
	function getStepOutput(batchOut, stepName) {
		var i, r;
		for (i = 0; i < batchOut.GetChildCount(); i++) {
			r = batchOut.GetChild(i);
			if (r.GetType() === "StepResult" && r.GetProperty("Name") === stepName) {
				return r.GetChildCount() > 0 ? r.GetChild(0) : null;
			}
		}
		return null;
	}

	/*
	 * run(steps, options, onDone, onError, scope)
	 *   steps    array of property sets from newStep()
	 *   options  {"StopOnError":"Y|N", "RaiseError":"Y|N"} or null
	 *   onDone   function(result)  - result = batch response (Status, FailedStep, StepResult children)
	 *   onError  function()        - call failed (network, or RaiseError = "Y")
	 */
	function run(steps, options, onDone, onError, scope) {
		var svc = SiebelApp.S_App.GetService(BATCH_BS);
		var inPS = newPS();
		var k, i;

		for (k in (options || {})) {
			if (options.hasOwnProperty(k)) { inPS.SetProperty(k, options[k]); }
		}
		for (i = 0; i < steps.length; i++) { inPS.AddChild(steps[i]); }

		svc.InvokeMethod("ExecuteBatch", inPS, {
			async: true,            // do not block the UI
			selfbusy: true,
			mask: true,             // show the busy indicator
			opdecode: true,
			scope: scope,
			cb: function (methodName, inputSet, outputSet) {
				if (onDone) { onDone.call(scope, unwrap(outputSet)); }
			},
			errcb: function () {
				if (onError) { onError.call(scope); }
			}
		});
	}

	return {
		newStep: newStep,
		run: run,
		getStepOutput: getStepOutput
	};
});
