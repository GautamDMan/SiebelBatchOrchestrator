# Siebel Batch Orchestrator Business Service

A server-side wrapper business service that runs **several business service methods in one call**
and lets the **output of one step feed the input of a later step**.

## Why

Every `InvokeMethod` from Browser Script to a server business service is a network round trip.
Three dependent calls cost three round trips, and the browser has to wait between them.

```
BEFORE   Browser ──► BS 1 ──► Browser ──► BS 2 ──► Browser ──► BS 3 ──► Browser     (3 round trips)

AFTER    Browser ──► Wrapper ──► BS 1 ─┐
                        │              ├─► BS 2 ─┐
                        │              │         ├─► BS 3
                        ◄──────── one combined response ◄───┘                       (1 round trip)
```

The wrapper runs on the Siebel server, so the calls between the steps are in-process and cheap.

## Files

| File | Purpose |
|---|---|
| `BatchOrchestratorBS.js` | The wrapper itself. Business service `XX Batch Orchestrator`, method `ExecuteBatch`. |
| `BatchOrchestrator_ServerExamples.js` | Test business service with 8 runnable examples, plus reusable helper functions. |
| `BatchOrchestrator_BrowserExamples.js` | Browser Script examples: applet button, smoke test, optional steps. |
| `README.md` | This document. |

## Setup

1. **Wrapper.** In Siebel Tools, create a business service named `XX Batch Orchestrator` (or any name,
   then update `BATCH_BS` in the example files). Add a server script, paste `BatchOrchestratorBS.js`,
   and compile.
2. **Make it callable from the browser.** The wrapper is a *server* script service. The
   `ClientBusinessService` application user property registers *Browser Script* business services,
   which is a different thing and is not what you want here. For a server service called from
   Browser Script, check your Siebel version's documentation on browser-callable services and
   Business Service Access (Administration - Application), and allow `XX Batch Orchestrator` and
   the services it will call. Behaviour and screen names vary by version, so please verify this
   in your environment.
3. **Allow-list (recommended).** Fill the `ALLOWED` object at the top of the wrapper with the services
   it may call, otherwise any caller can invoke any service by name through it:
   ```js
   var ALLOWED = {"XX Account Service": 1, "XX Contact Service": 1};
   ```
4. **Test.** Create the examples business service from `BatchOrchestrator_ServerExamples.js`, open
   *Administration - Business Service > Simulator*, run `RunExample` with input `Example = 1`,
   and read the `Result` property.

## Input structure

```
Inputs
 ├─ StopOnError = "Y" | "N"        batch default: Y (stop at first failed step)
 ├─ RaiseError  = "Y" | "N"        default N; Y raises an error to the caller if any step failed
 └─ [Step]                         one per call, executed in order
     ├─ Name        = "GetAcct"    unique alias; defaults to Step1, Step2, ...
     ├─ Service     = "XX Account Service"
     ├─ Method      = "GetAccount"
     ├─ StopOnError = "Y" | "N"    optional per-step override of the batch setting
     └─ [Inputs]                   the input property set for that method
         ├─ <prop> = <value>
         ├─ <prop> = "${GetAcct.AccountId}"
         ├─ $MergeOutput = "GetAcct"
         └─ [any child PS]         passed through as a child of the method's input
```

### References

| Syntax | Meaning |
|---|---|
| `${Step.Prop}` | Value of property `Prop` in the output of step `Step`. Can appear anywhere inside a value. |
| `"Hello ${S1.Name}, order ${S1.Id}"` | Several references embedded in one string. |
| `$MergeOutput = "Step"` | Copy **all** properties and children of that step's output into this input. |

Rules:

- A step can only reference steps that ran **earlier** in the list.
- Step names must not contain a dot (the reference is split at the first dot).
- Property names may contain spaces and dots, for example `${S1.Order Id}`.
- A reference to a property that does not exist resolves to an empty string.
- A reference to an unknown or not-yet-run step makes the step fail with a clear message.
- There is no escape for a literal `${`. Avoid that sequence in real data values.
- References also work inside child property sets of `Inputs`.

## Output structure

```
Outputs
 ├─ Status       = "Success" | "Error"
 ├─ FailedStep   = name of the first failed step (only on Error)
 ├─ ErrorMessage = its error text (only on Error)
 └─ [StepResult]                    one per step
     ├─ Name, Service, Method
     ├─ Status       = "Success" | "Error" | "Skipped"
     ├─ ErrorMessage (only on Error)
     └─ [Output]                    exactly what the called method returned
```

## Error handling

| Setting | Behaviour |
|---|---|
| default (`StopOnError` not set, or `Y`) | First failed step stops the batch. Remaining steps are `Skipped`. |
| step has `StopOnError = "N"` | That step's failure is recorded, and the batch continues. |
| batch `StopOnError = "N"` | Every failure is recorded, and the batch continues (a step can still set `Y`). |
| `RaiseError = "Y"` | After the batch, a failure is raised with `RaiseErrorText`, so `InvokeMethod` fails for the caller (use try/catch in scripts). |

Failures are also visible in the response: check `Status`, `FailedStep`, and `ErrorMessage`.

## Examples

All runnable examples are in `BatchOrchestrator_ServerExamples.js` (run them via the Simulator).

| # | Shows | Expected result |
|---|---|---|
| 1 | Chaining and embedded references | S2 `Message` = `Hello, Siebel!` |
| 2 | `$MergeOutput` | S2 output has props from S1 plus `Priority` |
| 3 | Child property sets with references inside | S2 output has child `ListOfItem` with `OrderId = 1-XYZ` |
| 4 | Continue after failure (`StopOnError = "N"`) | `Status = Error`, `FailedStep = S2`, S3 still `Success` |
| 5 | Default stop-on-error | S1 `Error`, S2 `Skipped` |
| 6 | `RaiseError = "Y"` | `InvokeMethod` fails, error is caught |
| 7 | Bad reference | S1 `Error`: step `Nope` is unknown or has not run yet |
| 8 | Real-world template (account, contacts, activity) | Placeholder services, adapt to yours |

### Minimal server-script call

```js
var steps = new Array();
steps[0] = NewStep("S1", "Workflow Utilities", "Echo", {"Greeting": "Hello", "Name": "Siebel"}, null, null);
steps[1] = NewStep("S2", "Workflow Utilities", "Echo", {"Message": "${S1.Greeting}, ${S1.Name}!"}, null, null);
var out = RunBatch(steps, null);
// out.GetProperty("Status") == "Success"
// GetStepOutput(out, "S2").GetProperty("Message") == "Hello, Siebel!"
```

### Minimal browser-script call

```js
var out = RunBatch(steps, {"StopOnError": "Y"});     // one network call
if (out.GetProperty("Status") != "Success")
    theApplication().SWEAlert(out.GetProperty("FailedStep") + ": " + out.GetProperty("ErrorMessage"));
```

### Property set as XML (for the Simulator or an inbound web service)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PropertySet StopOnError="Y" RaiseError="N">
  <PropertySet type="Step" Name="GetAcct" Service="XX Account Service" Method="GetAccount">
    <PropertySet type="Inputs" AccountNumber="1-ABC"/>
  </PropertySet>
  <PropertySet type="Step" Name="GetContacts" Service="XX Contact Service" Method="GetContacts">
    <PropertySet type="Inputs" AccountId="${GetAcct.AccountId}"/>
  </PropertySet>
</PropertySet>
```

### From a workflow process

A Business Service step can call `XX Batch Orchestrator` / `ExecuteBatch` with a hierarchy as input.
Build the hierarchy in an earlier step (a small script service, for example the `NewStep` helpers),
store it in a process property of type *Hierarchy*, and pass that property as the step's input
argument (*Input Argument Type = Process Property*, with the hierarchy property selected). The response
comes back in an output hierarchy property.

## Things to know

- **No transaction across steps.** Each business service commits on its own. If step 3 fails, steps 1
  and 2 are *not* rolled back. Design for that, for example by putting the risky step first.
- **Sequential only.** There are no loops, conditions, or parallel steps. For branching, put the
  logic in a workflow or a dedicated business service.
- **Large outputs.** The response contains a copy of every step's output. If one step returns a big
  hierarchy, response size (and the network saving) suffers. Keep step outputs lean.
- **Security.** Use the `ALLOWED` list. The wrapper runs steps with the logged-in user's access,
  same as a direct call, but the list stops callers from reaching services you did not intend.
- **Property set copies.** `AddChild` stores a copy, so build a property set completely before adding it.
- **Memory.** The scripts set property set variables to `null` when done, so keep that habit in your own callers.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Service '...' is not allowed through the batch wrapper` | Service is not in the `ALLOWED` list. |
| `step 'X' is unknown or has not run yet` | Typo in the reference, or the step is later in the list. |
| Reference resolves to empty text | Property name in the output differs. Check the `Output` child of the previous step. |
| `Duplicate step name` | Two steps share the same `Name`. |
| Browser script cannot reach the service | Browser access or Business Service Access is not set up for this service (see Setup step 2). |
| A step reports `Error` with only a generic message | Look at the Siebel log (`GetLastErrText` is appended to the message when available). |
