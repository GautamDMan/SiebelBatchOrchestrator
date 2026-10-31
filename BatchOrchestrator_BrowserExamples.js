/*
 * BROWSER SCRIPT examples: calling "XX Batch Orchestrator" (a SERVER business service)
 * from an applet or application browser script.
 *
 * This is the main use case for the wrapper: the browser makes ONE round trip to the server
 * and the server runs all the business service calls itself.
 *
 * BEFORE: browser -> server (BS 1), browser -> server (BS 2), browser -> server (BS 3)  = 3 calls
 * AFTER : browser -> server (wrapper -> BS 1 -> BS 2 -> BS 3)                           = 1 call
 *
 * Prerequisites
 *   - The wrapper BS is compiled and the BS (and the services it calls) may be invoked from
 *     the browser in your environment (Business Service Access / security settings).
 *   - Browser script compiled for the applet or application you paste this into.
 *
 * Browser Script notes
 *   - Use theApplication() (lower case t), not TheApplication().
 *   - svc.InvokeMethod(method, inputPS) RETURNS the output property set.
 *   - The PropertySet methods used here (SetType, GetType, SetProperty, GetProperty,
 *     GetFirstProperty, GetNextProperty, AddChild, GetChild, GetChildCount) are all
 *     available in Browser Script.
 */

var BATCH_BS = "XX Batch Orchestrator";

/* ------------------------------------------------------------------ *
 * EXAMPLE A: applet button. One click -> one server call -> three BS calls.
 *   Paste into the applet's browser script.
 * ------------------------------------------------------------------ */
function Applet_PreInvokeMethod (name, inputPropSet)
{
	if (name == "OpenAccountSummary")                   // your button's method name
	{
		var accId = this.BusComp().GetFieldValue("Id"); // value from the current record

		var steps = new Array();
		steps[0] = NewStep("GetAcct", "XX Account Service", "GetAccount",
		                   {"AccountId": accId}, null, null);
		steps[1] = NewStep("GetContacts", "XX Contact Service", "GetContacts",
		                   {"AccountId": "${GetAcct.AccountId}"}, null, null);
		steps[2] = NewStep("CreateAct", "XX Activity Service", "CreateActivity",
		                   {"AccountId": "${GetAcct.AccountId}",
		                    "Description": "Summary opened for ${GetAcct.Name}"}, null, null);

		var out = RunBatch(steps, {"StopOnError": "Y"});

		if (out == null)
		{
			theApplication().SWEAlert("The batch call did not return a response.");
		}
		else if (out.GetProperty("Status") != "Success")
		{
			theApplication().SWEAlert("Failed at step " + out.GetProperty("FailedStep") +
			                          ": " + out.GetProperty("ErrorMessage"));
		}
		else
		{
			var acct = GetStepOutput(out, "GetAcct");
			var contacts = GetStepOutput(out, "GetContacts");
			var nContacts = (contacts != null) ? contacts.GetChildCount() : 0;
			theApplication().SWEAlert(acct.GetProperty("Name") + " has " + nContacts + " contacts.");
		}
		return ("CancelOperation");
	}
	return ("ContinueOperation");
}

/* ------------------------------------------------------------------ *
 * EXAMPLE B: smoke test using only out-of-the-box services.
 *   Call TestBatch() from any event, e.g. temporarily from Applet_Load.
 *   Expected alert: S2 Message = "Hello, Siebel!"
 * ------------------------------------------------------------------ */
function TestBatch ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo",
	                   {"Greeting": "Hello", "Name": "Siebel"}, null, null);
	steps[1] = NewStep("S2", "Workflow Utilities", "Echo",
	                   {"Message": "${S1.Greeting}, ${S1.Name}!"}, null, null);

	var out = RunBatch(steps, null);
	theApplication().SWEAlert(PSToString(out, ""));
}

/* ------------------------------------------------------------------ *
 * EXAMPLE C: continue past an optional step, then check each step.
 * ------------------------------------------------------------------ */
function OptionalStepExample ()
{
	var steps = new Array();
	steps[0] = NewStep("Main", "XX Order Service", "CreateOrder", {"AccountId": "1-ABC"}, null, null);
	steps[1] = NewStep("Notify", "XX Notify Service", "SendMail",
	                   {"OrderId": "${Main.OrderId}"}, null, "N");   // optional: failure is OK
	steps[2] = NewStep("Audit", "XX Audit Service", "Log",
	                   {"$MergeOutput": "Main"}, null, null);        // whole Main output as input

	var out = RunBatch(steps, null);

	// Per-step status:
	for (var i = 0; i < out.GetChildCount(); i++)
	{
		var r = out.GetChild(i);
		if (r.GetType() == "StepResult")
		{
			// Status is "Success", "Error" or "Skipped"
			theApplication().SWEAlert(r.GetProperty("Name") + ": " + r.GetProperty("Status") +
			                          " " + r.GetProperty("ErrorMessage"));
		}
	}
}

/* ------------------------------------------------------------------ *
 * HELPERS (same idea as the server version)
 * ------------------------------------------------------------------ */
function NewStep (name, service, method, inputProps, childPSList, stopOnError)
{
	var step = theApplication().NewPropertySet();
	step.SetType("Step");
	step.SetProperty("Name", name);
	step.SetProperty("Service", service);
	step.SetProperty("Method", method);
	if (stopOnError != null && stopOnError != "")
		step.SetProperty("StopOnError", stopOnError);

	var inp = theApplication().NewPropertySet();
	inp.SetType("Inputs");
	if (inputProps != null)
	{
		for (var k in inputProps) { inp.SetProperty(k, inputProps[k]); }
	}
	if (childPSList != null)
	{
		for (var i = 0; i < childPSList.length; i++) { inp.AddChild(childPSList[i]); }
	}
	step.AddChild(inp);
	return step;
}

function RunBatch (steps, options)
{
	var inp = theApplication().NewPropertySet();
	if (options != null)
	{
		for (var k in options) { inp.SetProperty(k, options[k]); }
	}
	for (var i = 0; i < steps.length; i++) { inp.AddChild(steps[i]); }

	var svc = theApplication().GetService(BATCH_BS);
	return svc.InvokeMethod("ExecuteBatch", inp);     // ONE network call
}

function GetStepOutput (batchOut, stepName)
{
	for (var i = 0; i < batchOut.GetChildCount(); i++)
	{
		var res = batchOut.GetChild(i);
		if (res.GetType() == "StepResult" && res.GetProperty("Name") == stepName)
			return (res.GetChildCount() > 0) ? res.GetChild(0) : null;
	}
	return null;
}

function PSToString (ps, indent)
{
	if (ps == null) return indent + "(null)\n";
	var s = indent + "[" + ps.GetType() + "]\n";
	var n = ps.GetFirstProperty();
	while (n != "")
	{
		s += indent + "  " + n + " = " + ps.GetProperty(n) + "\n";
		n = ps.GetNextProperty();
	}
	for (var i = 0; i < ps.GetChildCount(); i++)
		s += PSToString(ps.GetChild(i), indent + "    ");
	return s;
}
