/*
 * Business Service : XX Batch Orchestrator Examples   (TEST service, do not ship to production)
 * Method           : RunExample        Input property "Example" = 1..8
 * Output           : property "Result" = readable dump of the batch response
 *
 * HOW TO USE
 *   1. Create the wrapper first (BatchOrchestratorBS.js) as "XX Batch Orchestrator".
 *   2. Create this second business service and paste this file into its server script.
 *   3. Run it from the Business Service Simulator:
 *        Service = XX Batch Orchestrator Examples, Method = RunExample,
 *        Input: Example = 1  ->  click Run  ->  read "Result" in the output.
 *
 * Examples 1-7 use only the out-of-the-box "Workflow Utilities" service, method "Echo"
 * (returns its input properties and children unchanged), so they run on any database.
 * Example 8 uses placeholder service names: it is a template, adapt it to your services.
 *
 *   1  Smoke test: chaining + embedded references in a string
 *   2  $MergeOutput: pass a whole previous output into the next step
 *   3  Child property sets passed through (with ${} references inside them)
 *   4  Continue after a failed step (StopOnError = "N" on the step)
 *   5  Default behaviour: stop at first failure, remaining steps "Skipped"
 *   6  RaiseError = "Y": failure is raised as an error to the caller
 *   7  Bad reference (unknown step) is reported as a step error
 *   8  Real-world template: account -> contacts -> create activity
 */

var BATCH_BS = "XX Batch Orchestrator";

function Service_PreInvokeMethod (MethodName, Inputs, Outputs)
{
	if (MethodName == "RunExample")
	{
		var n = Inputs.GetProperty("Example");
		var text = "";
		try
		{
			switch (n)
			{
				case "1": text = Example1_SmokeTest(); break;
				case "2": text = Example2_MergeOutput(); break;
				case "3": text = Example3_ChildPropertySets(); break;
				case "4": text = Example4_ContinueOnError(); break;
				case "5": text = Example5_StopOnError(); break;
				case "6": text = Example6_RaiseError(); break;
				case "7": text = Example7_BadReference(); break;
				case "8": text = Example8_RealWorldTemplate(); break;
				default:  text = "Set input property Example to 1..8";
			}
		}
		catch (e)
		{
			text = "Exception: " + e.toString() + " | " + TheApplication().GetLastErrText();
		}
		Outputs.SetProperty("Result", text);
		return (CancelOperation);
	}
	return (ContinueOperation);
}

/* ------------------------------------------------------------------ *
 * EXAMPLES
 * ------------------------------------------------------------------ */

// 1. Step S2 uses two properties of S1's output, embedded in a string.
//    Expected: S2 output Message = "Hello, Siebel!"
function Example1_SmokeTest ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo",
	                   {"Greeting": "Hello", "Name": "Siebel"}, null, null);
	steps[1] = NewStep("S2", "Workflow Utilities", "Echo",
	                   {"Message": "${S1.Greeting}, ${S1.Name}!"}, null, null);

	var out = RunBatch(steps, null);
	var s = PSToString(out, "");
	out = null;
	return s;
}

// 2. $MergeOutput copies every property and child of S1's output into S2's input,
//    then S2 adds one more property.
//    Expected: S2 output has OrderId, Status (from S1) and Priority.
function Example2_MergeOutput ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo",
	                   {"OrderId": "1-XYZ", "Status": "Open"}, null, null);
	steps[1] = NewStep("S2", "Workflow Utilities", "Echo",
	                   {"$MergeOutput": "S1", "Priority": "High"}, null, null);

	var out = RunBatch(steps, null);
	var s = PSToString(out, "");
	out = null;
	return s;
}

// 3. A hierarchy (child property set) in the step input. Properties inside the child
//    can use ${} references too.
//    Expected: S2 output has child "ListOfItem" with OrderId = "1-XYZ".
function Example3_ChildPropertySets ()
{
	var child = TheApplication().NewPropertySet();
	child.SetType("ListOfItem");
	child.SetProperty("OrderId", "${S1.OrderId}");
	child.SetProperty("Qty", "2");

	var kids = new Array();
	kids[0] = child;

	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo", {"OrderId": "1-XYZ"}, null, null);
	steps[1] = NewStep("S2", "Workflow Utilities", "Echo", {}, kids, null);

	var out = RunBatch(steps, null);
	var s = PSToString(out, "");
	child = null; kids = null; out = null;
	return s;
}

// 4. S2 fails but has StopOnError = "N", so S3 still runs (and can use S1's output).
//    Expected: Status = Error, FailedStep = S2, S1 and S3 = Success.
function Example4_ContinueOnError ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo", {"Val": "42"}, null, null);
	steps[1] = NewStep("S2", "XX Does Not Exist", "Foo", {}, null, "N");
	steps[2] = NewStep("S3", "Workflow Utilities", "Echo", {"Val": "${S1.Val}"}, null, null);

	var out = RunBatch(steps, null);
	var s = PSToString(out, "");
	out = null;
	return s;
}

// 5. Default: first failure stops the batch. S2 is reported as "Skipped".
//    Expected: S1 = Error, S2 = Skipped. Same result with batch-level StopOnError = "Y".
function Example5_StopOnError ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "XX Does Not Exist", "Foo", {}, null, null);
	steps[1] = NewStep("S2", "Workflow Utilities", "Echo", {"A": "B"}, null, null);

	var out = RunBatch(steps, {"StopOnError": "Y"});
	var s = PSToString(out, "");
	out = null;
	return s;
}

// 6. RaiseError = "Y": InvokeMethod itself fails, so the caller needs try/catch.
//    Inside a workflow / UI event this is what shows the standard Siebel error popup.
function Example6_RaiseError ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "XX Does Not Exist", "Foo", {}, null, null);

	var s = "";
	try
	{
		var out = RunBatch(steps, {"RaiseError": "Y"});
		s = "No error was raised?\n" + PSToString(out, "");
		out = null;
	}
	catch (e)
	{
		s = "Caught as expected: " + TheApplication().GetLastErrText();
	}
	return s;
}

// 7. Reference to a step that does not exist (typo) or has not run yet.
//    Expected: S1 = Error with message "...step 'Nope' is unknown or has not run yet."
function Example7_BadReference ()
{
	var steps = new Array();
	steps[0] = NewStep("S1", "Workflow Utilities", "Echo", {"A": "${Nope.X}"}, null, null);

	var out = RunBatch(steps, null);
	var s = PSToString(out, "");
	out = null;
	return s;
}

// 8. TEMPLATE with placeholder services (replace with yours).
//    One network call from the client instead of three:
//      GetAcct      -> returns AccountId, Name
//      GetContacts  -> input AccountId from GetAcct, returns child list of contacts
//      CreateAct    -> input AccountId + text built from GetAcct.Name
function Example8_RealWorldTemplate ()
{
	var steps = new Array();
	steps[0] = NewStep("GetAcct", "XX Account Service", "GetAccount",
	                   {"AccountNumber": "1-ABC"}, null, null);
	steps[1] = NewStep("GetContacts", "XX Contact Service", "GetContacts",
	                   {"AccountId": "${GetAcct.AccountId}"}, null, null);
	steps[2] = NewStep("CreateAct", "XX Activity Service", "CreateActivity",
	                   {"AccountId": "${GetAcct.AccountId}",
	                    "Description": "Review of ${GetAcct.Name}",
	                    "Type": "Call"}, null, null);

	var out = RunBatch(steps, {"StopOnError": "Y"});

	// Read results the way a real caller would:
	var s = "";
	if (out.GetProperty("Status") == "Success")
	{
		var acct = GetStepOutput(out, "GetAcct");
		s = "Account: " + acct.GetProperty("Name") + "\n";
		acct = null;
	}
	else
	{
		s = "Failed at " + out.GetProperty("FailedStep") + ": " + out.GetProperty("ErrorMessage") + "\n";
	}
	s += PSToString(out, "");
	out = null;
	return s;
}

/* ------------------------------------------------------------------ *
 * HELPERS (copy these into your own caller)
 * ------------------------------------------------------------------ */

// Builds one "Step" property set.
//   inputProps    plain object {"Prop": "value"} or null
//   childPSList   Array of PropertySets passed as children of Inputs, or null
//   stopOnError   "Y" / "N" / null
// NOTE: AddChild stores a copy, so each PS is fully built before it is added.
function NewStep (name, service, method, inputProps, childPSList, stopOnError)
{
	var step = TheApplication().NewPropertySet();
	step.SetType("Step");
	step.SetProperty("Name", name);
	step.SetProperty("Service", service);
	step.SetProperty("Method", method);
	if (stopOnError != null && stopOnError != "")
		step.SetProperty("StopOnError", stopOnError);

	var inp = TheApplication().NewPropertySet();
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
	inp = null;
	return step;
}

// Calls the wrapper with an Array of steps. options = {"StopOnError":"N","RaiseError":"Y"} or null.
function RunBatch (steps, options)
{
	var inp = TheApplication().NewPropertySet();
	var out = TheApplication().NewPropertySet();
	if (options != null)
	{
		for (var k in options) { inp.SetProperty(k, options[k]); }
	}
	for (var i = 0; i < steps.length; i++)
	{
		inp.AddChild(steps[i]);
		steps[i] = null;
	}
	var svc = TheApplication().GetService(BATCH_BS);
	svc.InvokeMethod("ExecuteBatch", inp, out);
	svc = null; inp = null;
	return out;
}

// Returns a copy of the Output PS of the named step (or null if not found).
function GetStepOutput (batchOut, stepName)
{
	var n = batchOut.GetChildCount();
	var res, o;
	for (var i = 0; i < n; i++)
	{
		res = batchOut.GetChild(i);
		if (res.GetType() == "StepResult" && res.GetProperty("Name") == stepName)
		{
			if (res.GetChildCount() > 0)
			{
				o = res.GetChild(0).Copy();
				return o;
			}
			return null;
		}
	}
	return null;
}

// Readable dump of any property set (for testing / tracing).
function PSToString (ps, indent)
{
	var s = indent + "[" + ps.GetType() + "]";
	if (ps.GetValue() != "") s += " value=" + ps.GetValue();
	s += "\n";

	var n = ps.GetFirstProperty();
	while (n != "")
	{
		s += indent + "  " + n + " = " + ps.GetProperty(n) + "\n";
		n = ps.GetNextProperty();
	}
	var cnt = ps.GetChildCount();
	for (var i = 0; i < cnt; i++)
		s += PSToString(ps.GetChild(i), indent + "    ");
	return s;
}
