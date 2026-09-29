/**
 * Orarul meu — Google Apps Script Backend
 * =========================================
 * Deploy this as a Web App:
 *   Extensions → Apps Script → Deploy → New Deployment
 *   Type: Web App
 *   Execute as: Me
 *   Access: Anyone
 *
 * The app stores the full calendar JSON in cell A1 of the "Data" sheet.
 *
 * Endpoints:
 *   GET  ?action=read  → returns {status:"ok", data:"<json string>"}
 *   POST (body: JSON string with {data:"<json string>"}) → saves & returns {status:"ok"}
 */

var SHEET_NAME = "Data";
var CELL = "A1";

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "read";
  var output;
  if (action === "read") {
    try {
      var sheet = getSheet();
      var raw = sheet.getRange(CELL).getValue();
      output = ContentService.createTextOutput(
        JSON.stringify({ status: "ok", data: raw || "" })
      );
    } catch (err) {
      output = ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: err.message })
      );
    }
  } else {
    output = ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: "Unknown action" })
    );
  }
  output.setMimeType(ContentService.MimeType.JSON);
  // CORS
  return output;
}

function doPost(e) {
  var output;
  try {
    var body = JSON.parse(e.postData.contents);
    var dataStr = body.data;
    if (typeof dataStr !== "string") throw new Error("Invalid payload");
    var sheet = getSheet();
    sheet.getRange(CELL).setValue(dataStr);
    output = ContentService.createTextOutput(
      JSON.stringify({ status: "ok" })
    );
  } catch (err) {
    output = ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.message })
    );
  }
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
