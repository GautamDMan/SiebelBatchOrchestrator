/*
 * File : siebel/custom/AccountSummaryPM.js   (Presentation Model for an Account list/form applet)
 *
 * The PM owns the data and the server call. The PR (AccountSummaryPR.js) only draws the UI.
 *   PR button click -> pm.ExecuteMethod("OpenSummary")
 *   PM runs ONE batch call (3 business services on the server)
 *   PM sets the "SummaryText" property -> PR is notified and shows it
 */
if (typeof (SiebelAppFacade.AccountSummaryPM) === "undefined") {

	SiebelJS.Namespace("SiebelAppFacade.AccountSummaryPM");

	define("siebel/custom/AccountSummaryPM", ["siebel/pmodel", "siebel/custom/BatchClient"],
	function (pmodel, BatchClient) {

		SiebelAppFacade.AccountSummaryPM = (function () {

			function AccountSummaryPM(pm) {
				SiebelAppFacade.AccountSummaryPM.superclass.constructor.apply(this, arguments);
			}

			SiebelJS.Extend(AccountSummaryPM, SiebelAppFacade.PresentationModel);

			AccountSummaryPM.prototype.Init = function () {
				SiebelAppFacade.AccountSummaryPM.superclass.Init.apply(this, arguments);

				// Property the PR listens to
				this.AddProperty("SummaryText", "");

				// Method the PR calls when the button is clicked
				this.AddMethod("OpenSummary", OpenSummary, { sequence: false, scope: this });
			};

			// ---------------------------------------------------------------
			function OpenSummary() {
				var records = this.Get("GetRecordSet");      // array of {FieldName: value}
				var sel = this.Get("GetSelection");          // index of the current row
				if (!records || sel < 0 || !records[sel]) { return; }

				// "Id" must be available in the applet (hidden list column / control)
				var accId = records[sel]["Id"];

				var steps = [
					BatchClient.newStep("GetAcct", "XX Account Service", "GetAccount",
						{ "AccountId": accId }),
					BatchClient.newStep("GetContacts", "XX Contact Service", "GetContacts",
						{ "AccountId": "${GetAcct.AccountId}" }),                 // chained from step 1
					BatchClient.newStep("CreateAct", "XX Activity Service", "CreateActivity",
						{ "AccountId": "${GetAcct.AccountId}",
						  "Description": "Summary opened for ${GetAcct.Name}" })
				];

				BatchClient.run(steps, { "StopOnError": "Y" }, OnBatchDone, OnBatchError, this);
			}

			// 'this' is the PM, because BatchClient.run was given scope = this
			function OnBatchDone(result) {
				var text;
				if (result.GetProperty("Status") !== "Success") {
					text = "Failed at " + result.GetProperty("FailedStep") + ": " +
					       result.GetProperty("ErrorMessage");
				} else {
					var acct = BatchClient.getStepOutput(result, "GetAcct");
					var contacts = BatchClient.getStepOutput(result, "GetContacts");
					var n = contacts ? contacts.GetChildCount() : 0;
					text = acct.GetProperty("Name") + " has " + n + " contact(s).";
				}
				this.SetProperty("SummaryText", text);       // notifies the PR
			}

			function OnBatchError() {
				this.SetProperty("SummaryText", "The server call failed. See the Siebel log.");
			}

			return AccountSummaryPM;
		}());
	});
}
