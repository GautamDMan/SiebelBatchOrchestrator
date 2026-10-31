/*
 * File : siebel/custom/AccountSummaryPR.js   (Physical Renderer)
 *
 * Draws a button and a result area. All logic and the server call live in the PM.
 */
if (typeof (SiebelAppFacade.AccountSummaryPR) === "undefined") {

	SiebelJS.Namespace("SiebelAppFacade.AccountSummaryPR");

	define("siebel/custom/AccountSummaryPR", ["siebel/phyrenderer"], function () {

		SiebelAppFacade.AccountSummaryPR = (function () {

			function AccountSummaryPR(pm) {
				SiebelAppFacade.AccountSummaryPR.superclass.constructor.apply(this, arguments);
			}

			SiebelJS.Extend(AccountSummaryPR, SiebelAppFacade.PhysicalRenderer);

			AccountSummaryPR.prototype.Init = function () {
				SiebelAppFacade.AccountSummaryPR.superclass.Init.apply(this, arguments);
			};

			AccountSummaryPR.prototype.ShowUI = function () {
				SiebelAppFacade.AccountSummaryPR.superclass.ShowUI.apply(this, arguments);

				var pm = this.GetPM();
				var appletDiv = $("#s_" + pm.Get("GetFullId") + "_div");

				var btn = $("<button type='button' class='appletButton'>Account Summary</button>");
				var out = $("<div class='batch-summary'></div>");
				appletDiv.prepend(out).prepend(btn);

				btn.on("click", function () {
					out.text("Loading...");
					pm.ExecuteMethod("OpenSummary");        // PM makes the ONE batch call
				});

				this.summaryDiv = out;
			};

			AccountSummaryPR.prototype.BindEvents = function () {
				SiebelAppFacade.AccountSummaryPR.superclass.BindEvents.apply(this, arguments);

				// Fires whenever the PM does this.SetProperty("SummaryText", ...)
				this.AttachPMBinding("SummaryText", function () {
					this.summaryDiv.text(this.GetPM().Get("SummaryText"));
				}, { scope: this });
			};

			return AccountSummaryPR;
		}());
	});
}
