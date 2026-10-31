/*
 * Business Service : XX Batch Orchestrator   (name it as you like in Tools)
 * Method           : ExecuteBatch
 * Type             : Server script (eScript)  -- Service_PreInvokeMethod
 *
 * PURPOSE
 *   One call from the client -> many business service calls on the server.
 *   Output of one step can be used as input of any later step.
 *
 * ---------------------------------------------------------------------------
 * INPUT PROPERTY SET STRUCTURE
 * ---------------------------------------------------------------------------
 * Inputs (type: anything)
 *   Property  StopOnError = "Y" | "N"   (default Y; stop at first failed step)
 *   Property  RaiseError  = "Y" | "N"   (default N; Y = raise error to UI if any step failed)
 *   Child     type "Step"   (one per BS call, executed in order)
 *       Property Name           unique alias, e.g. "GetAcct"   (default Step1, Step2...)
 *       Property Service        business service name
 *       Property Method         method name
 *       Property StopOnError    optional per-step override (Y/N)
 *       Child    type "Inputs"  = the input property set for that BS method
 *           Property <name> = <value>
 *           Property <name> = "${GetAcct.AccountId}"      <- output of earlier step
 *           Property <name> = "Prefix-${GetAcct.Name}-X"   <- embedded reference
 *           Property $MergeOutput = "GetAcct"              <- copy ALL props + children
 *                                                             of that step's output
 *           Child PS (any type)     <- passed through as child of the input PS;
 *                                      its properties may also use ${...} references
 *
 * ---------------------------------------------------------------------------
 * OUTPUT PROPERTY SET STRUCTURE
 * ---------------------------------------------------------------------------
 * Outputs
 *   Property Status       = "Success" | "Error"
 *   Property FailedStep   = name of first failed step (if any)
 *   Property ErrorMessage = error text of first failed step (if any)
 *   Child type "StepResult" (one per executed step)
 *       Property Name, Service, Method, Status ("Success"/"Error"/"Skipped"), ErrorMessage
 *       Child type "Output" = the exact output PS returned by that BS method
 *
 * ---------------------------------------------------------------------------
 * EXAMPLE (browser script / server script caller)
 * ---------------------------------------------------------------------------
 *   var ps = theApplication().NewPropertySet();      // TheApplication() on server
 *   var s1 = theApplication().NewPropertySet();
 *   s1.SetType("Step");
 *   s1.SetProperty("Name", "GetAcct");
 *   s1.SetProperty("Service", "XX Account Service");
 *   s1.SetProperty("Method", "GetAccount");
 *   var i1 = theApplication().NewPropertySet();
 *   i1.SetType("Inputs");
 *   i1.SetProperty("AccountNumber", "1-ABC");
 *   s1.AddChild(i1);
 *   ps.AddChild(s1);
 *
 *   var s2 = theApplication().NewPropertySet();
 *   s2.SetType("Step");
 *   s2.SetProperty("Name", "Update");
 *   s2.SetProperty("Service", "XX Order Service");
 *   s2.SetProperty("Method", "CreateOrder");
 *   var i2 = theApplication().NewPropertySet();
 *   i2.SetType("Inputs");
 *   i2.SetProperty("AccountId", "${GetAcct.AccountId}");   // chained from step 1
 *   s2.AddChild(i2);
 *   ps.AddChild(s2);
 *
 *   var out = theApplication().NewPropertySet();
 *   theApplication().GetService("XX Batch Orchestrator").InvokeMethod("ExecuteBatch", ps, out);
 */

// Optional allow-list. Leave empty to allow any service.
// Recommended for production: stops callers from invoking arbitrary services
// through this wrapper, e.g. var ALLOWED = {"XX Account Service": 1, "XX Order Service": 1};
var ALLOWED = {};

function Service_PreInvokeMethod (MethodName, Inputs, Outputs)
{
	if (MethodName == "ExecuteBatch")
	{
		ExecuteBatch(Inputs, Outputs);
		return (CancelOperation);
	}
	return (ContinueOperation);
}

function ExecuteBatch (Inputs, Outputs)
{
	var results   = {};          // stepName -> output PropertySet (kept for chaining)
	var overall   = "Success";
	var failedStep = "";
	var firstErr  = "";
	var globalStop = (Inputs.GetProperty("StopOnError") != "N");
	var raiseErr   = (Inputs.GetProperty("RaiseError") == "Y");
	var stopped    = false;
	var count      = Inputs.GetChildCount();
	var stepNo     = 0;
	var i, step, stepName, svcName, method, stopFlag, ok, resPS;

	try
	{
		for (i = 0; i < count; i++)
		{
			step = Inputs.GetChild(i);
			if (step.GetType() != "Step") continue;

			stepNo++;
			stepName = step.GetProperty("Name");
			if (stepName == "") stepName = "Step" + stepNo;
			svcName  = step.GetProperty("Service");
			method   = step.GetProperty("Method");

			resPS = TheApplication().NewPropertySet();
			resPS.SetType("StepResult");
			resPS.SetProperty("Name", stepName);
			resPS.SetProperty("Service", svcName);
			resPS.SetProperty("Method", method);

			if (stopped)
			{
				resPS.SetProperty("Status", "Skipped");
				Outputs.AddChild(resPS);
				resPS = null;
				continue;
			}

			ok = RunStep(step, stepName, svcName, method, results, resPS);
			Outputs.AddChild(resPS);

			if (!ok)
			{
				if (overall == "Success")
				{
					overall    = "Error";
					failedStep = stepName;
					firstErr   = resPS.GetProperty("ErrorMessage");
				}
				stopFlag = step.GetProperty("StopOnError");
				if (stopFlag == "") stopFlag = (globalStop ? "Y" : "N");
				if (stopFlag == "Y") stopped = true;
			}
			resPS = null;
		}
	}
	finally
	{
		// release PropertySets
		for (var k in results) { results[k] = null; }
		results = null;
		step = null;
		resPS = null;
	}

	Outputs.SetProperty("Status", overall);
	if (overall == "Error")
	{
		Outputs.SetProperty("FailedStep", failedStep);
		Outputs.SetProperty("ErrorMessage", firstErr);
		if (raiseErr)
			TheApplication().RaiseErrorText("Batch failed at step '" + failedStep + "': " + firstErr);
	}
}

// Runs one step. Returns true on success. Fills resPS with status/output.
function RunStep (step, stepName, svcName, method, results, resPS)
{
	var svc = null, svcIn = null, svcOut = null, outCopy = null;
	try
	{
		if (svcName == "" || method == "")
			throw "Step '" + stepName + "' needs both Service and Method.";

		if (HasKeys(ALLOWED) && ALLOWED[svcName] == null)
			throw "Service '" + svcName + "' is not allowed through the batch wrapper.";

		if (results[stepName] != null)
			throw "Duplicate step name '" + stepName + "'.";

		svcIn  = BuildInputs(step, results);
		svcOut = TheApplication().NewPropertySet();
		svc    = TheApplication().GetService(svcName);
		svc.InvokeMethod(method, svcIn, svcOut);

		results[stepName] = svcOut;          // keep for later ${stepName.Prop} references

		outCopy = svcOut.Copy();
		outCopy.SetType("Output");
		resPS.AddChild(outCopy);
		resPS.SetProperty("Status", "Success");
		return true;
	}
	catch (e)
	{
		var msg = (e.message ? e.message : e.toString());
		var siebErr = TheApplication().GetLastErrText();
		if (siebErr != "" && msg.indexOf(siebErr) < 0) msg = msg + " | " + siebErr;
		resPS.SetProperty("Status", "Error");
		resPS.SetProperty("ErrorMessage", msg);
		return false;
	}
	finally
	{
		svc = null; svcIn = null; outCopy = null;
		// svcOut intentionally kept in results (released in ExecuteBatch)
	}
}

// Builds the input PS for a step from its "Inputs" child(ren), resolving ${Step.Prop} references.
function BuildInputs (step, results)
{
	var svcIn = TheApplication().NewPropertySet();
	var cnt = step.GetChildCount();
	var node;
	for (var c = 0; c < cnt; c++)
	{
		node = step.GetChild(c);
		if (node.GetType() == "Inputs")
			ResolveInto(node, svcIn, results);
	}
	node = null;
	return svcIn;
}

// Copies props and children from src to dest, resolving references.
function ResolveInto (src, dest, results)
{
	var name, val, tmp, ref, child;
	var cnt, j;

	name = src.GetFirstProperty();
	while (name != "")
	{
		val = src.GetProperty(name);
		if (name == "$MergeOutput")
		{
			ref = results[val];
			if (ref == null) throw "$MergeOutput refers to unknown or not-yet-executed step: " + val;
			MergePS(ref, dest);
		}
		else
		{
			dest.SetProperty(name, ResolveValue(val, results));
		}
		name = src.GetNextProperty();
	}

	cnt = src.GetChildCount();
	for (j = 0; j < cnt; j++)
	{
		child = src.GetChild(j);
		tmp = TheApplication().NewPropertySet();
		tmp.SetType(child.GetType());
		tmp.SetValue(child.GetValue());
		ResolveInto(child, tmp, results);
		dest.AddChild(tmp);
		tmp = null;
	}
	child = null;
}

// Copies all properties and children of src into dest.
function MergePS (src, dest)
{
	var name = src.GetFirstProperty();
	while (name != "")
	{
		dest.SetProperty(name, src.GetProperty(name));
		name = src.GetNextProperty();
	}
	var cnt = src.GetChildCount();
	for (var j = 0; j < cnt; j++)
		dest.AddChild(src.GetChild(j).Copy());
}

// Replaces every ${Step.Property} in val with that step's output property value.
function ResolveValue (val, results)
{
	if (val == null || val == "") return val;
	var s = "" + val;
	var start = s.indexOf("${");
	var end, ref, dot, stepName, propName, repl;

	while (start >= 0)
	{
		end = s.indexOf("}", start);
		if (end < 0) break;

		ref = s.substring(start + 2, end);
		dot = ref.indexOf(".");
		if (dot <= 0) throw "Invalid reference '${" + ref + "}'. Use ${StepName.PropertyName}.";

		stepName = ref.substring(0, dot);
		propName = ref.substring(dot + 1);

		if (results[stepName] == null)
			throw "Reference '${" + ref + "}': step '" + stepName + "' is unknown or has not run yet.";

		repl = results[stepName].GetProperty(propName);
		s = s.substring(0, start) + repl + s.substring(end + 1);
		start = s.indexOf("${", start + repl.length);
	}
	return s;
}

function HasKeys (obj)
{
	for (var k in obj) { return true; }
	return false;
}
