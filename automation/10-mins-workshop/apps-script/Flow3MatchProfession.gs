// ============================================================
// FLOW 3 – MATCH PROFESSION
// Spreadsheet: "Active Campaign List Upload 11 - 2026"
// ============================================================
//
// SOURCE:
// Sheet62 (in the previous spreadsheet – the new one has no Sheet62)
//
// TARGET (in the spreadsheet this script runs in):
// DD MMM YYYY 10 Mins Workshop attendee (w/o buyers)
//
// RESULT:
//
// A = Name
// B = Email
// C = Phone
// D = Time
// E = Profession
//
// IMPORTANT:
// A:D are NEVER changed.
// Only Column E is written.
//
// Names here are prefixed FLOW3 so this file can sit in the same
// Apps Script project as Workshop.gs without clashing.
// ============================================================


// Where Sheet62 lives. Change these if Sheet62 is moved.
const FLOW3_SOURCE_SPREADSHEET_ID =
  "1xQEivSCmMv4WBpN8fqlLrisj8EXJBy0YLXzWAX58NhI";

const FLOW3_SOURCE_TAB =
  "Sheet62";

// Time zone for today's sheet name (the spreadsheet is set to GMT).
const FLOW3_TIME_ZONE =
  "Asia/Kolkata";


function flow3MatchProfession() {

  // Target spreadsheet = the one this script runs in
  const ss = SpreadsheetApp.getActiveSpreadsheet();


  // ==========================================================
  // SOURCE SHEET
  // ==========================================================

  const sourceSS =
    SpreadsheetApp.openById(FLOW3_SOURCE_SPREADSHEET_ID);

  const sourceSheet =
    sourceSS.getSheetByName(FLOW3_SOURCE_TAB);

  if (!sourceSheet) {

    const sheetNames = sourceSS
      .getSheets()
      .map(sheet => sheet.getName())
      .join("\n");

    throw new Error(
      "Sheet '" + FLOW3_SOURCE_TAB + "' was not found in the source spreadsheet.\n\n" +
      "Sheets currently found:\n\n" +
      sheetNames
    );
  }


  // ==========================================================
  // AUTO DATE (India time)
  // ==========================================================

  const now = new Date();

  const day =
    Utilities.formatDate(now, FLOW3_TIME_ZONE, "dd");

  const month =
    Utilities.formatDate(now, FLOW3_TIME_ZONE, "MMM").toUpperCase();

  const year =
    Utilities.formatDate(now, FLOW3_TIME_ZONE, "yyyy");


  // ==========================================================
  // TARGET SHEET
  // ==========================================================

  const targetSheetName =
    `${day} ${month} ${year} 10 Mins Workshop attendee (w/o buyers)`;

  const targetSheet =
    ss.getSheetByName(targetSheetName);

  if (!targetSheet) {

    const sheetNames = ss
      .getSheets()
      .map(sheet => sheet.getName())
      .join("\n");

    throw new Error(
      "Target sheet was not found:\n\n" +
      targetSheetName +
      "\n\n" +
      "Available sheets:\n\n" +
      sheetNames
    );
  }


  // ==========================================================
  // READ SHEET62
  // ==========================================================

  const sourceData =
    sourceSheet
      .getDataRange()
      .getValues();

  if (sourceData.length < 2) {
    SpreadsheetApp.getUi().alert(FLOW3_SOURCE_TAB + " has no data.");
    return;
  }


  // ==========================================================
  // SOURCE HEADERS
  // ==========================================================

  const sourceHeaders =
    sourceData[0].map(
      header => String(header).trim().toLowerCase()
    );

  const sourceEmailCol      = sourceHeaders.indexOf("email");
  const sourcePhoneCol      = sourceHeaders.indexOf("phone");
  const sourceProfessionCol = sourceHeaders.indexOf("profession");

  if (sourceEmailCol === -1) {
    throw new Error(FLOW3_SOURCE_TAB + ": Email column not found.");
  }

  if (sourcePhoneCol === -1) {
    throw new Error(FLOW3_SOURCE_TAB + ": Phone column not found.");
  }

  if (sourceProfessionCol === -1) {
    throw new Error(FLOW3_SOURCE_TAB + ": Profession column not found.");
  }


  // ==========================================================
  // CREATE LOOKUP MAPS
  // ==========================================================

  const emailMap = {};
  const phoneMap = {};

  for (let i = 1; i < sourceData.length; i++) {

    const email =
      flow3NormalizeEmail(sourceData[i][sourceEmailCol]);

    const phone =
      flow3NormalizePhone(sourceData[i][sourcePhoneCol]);

    const profession =
      String(sourceData[i][sourceProfessionCol] || "").trim();

    if (email && profession) {
      emailMap[email] = profession;
    }

    // Only full 10-digit phones, so partial numbers can't mismatch
    if (phone.length === 10 && profession) {
      phoneMap[phone] = profession;
    }

  }


  // ==========================================================
  // READ TARGET A:D ONLY
  // ==========================================================

  const lastRow =
    targetSheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(targetSheetName + " has no attendee data.");
    return;
  }

  const targetData =
    targetSheet
      .getRange(1, 1, lastRow, 4)
      .getValues();


  // ==========================================================
  // MATCH
  // ==========================================================

  const professionResults = [
    ["Profession"]
  ];

  let matchedByEmail = 0;
  let matchedByPhone = 0;
  let notMatched = 0;

  for (let i = 1; i < targetData.length; i++) {

    const attendeeEmail =
      flow3NormalizeEmail(targetData[i][1]);

    const attendeePhone =
      flow3NormalizePhone(targetData[i][2]);

    let profession = "";

    // FIRST: EMAIL
    if (attendeeEmail && emailMap[attendeeEmail]) {

      profession = emailMap[attendeeEmail];
      matchedByEmail++;

    }

    // SECOND: PHONE
    else if (attendeePhone && phoneMap[attendeePhone]) {

      profession = phoneMap[attendeePhone];
      matchedByPhone++;

    }

    // NO MATCH
    else {

      notMatched++;

    }

    professionResults.push([profession]);

  }


  // ==========================================================
  // WRITE ONLY COLUMN E
  // ==========================================================
  //
  // A = Name       untouched
  // B = Email      untouched
  // C = Phone      untouched
  // D = Time       untouched
  // E = Profession updated
  //
  // ==========================================================

  targetSheet
    .getRange(1, 5, professionResults.length, 1)
    .setValues(professionResults);


  // ==========================================================
  // COMPLETION
  // ==========================================================

  SpreadsheetApp.getUi().alert(
    "Profession Matching Completed!\n\n" +
    "Target:\n" +
    targetSheetName +
    "\n\n" +
    "Matched by Email: " + matchedByEmail + "\n" +
    "Matched by Phone: " + matchedByPhone + "\n" +
    "Not Matched: " + notMatched
  );

}


// ============================================================
// NORMALIZE EMAIL
// ============================================================

function flow3NormalizeEmail(email) {

  if (!email) {
    return "";
  }

  return String(email).trim().toLowerCase();

}


// ============================================================
// NORMALIZE PHONE
// ============================================================

function flow3NormalizePhone(phone) {

  if (!phone) {
    return "";
  }

  let cleaned =
    String(phone).replace(/\D/g, "");

  // Remove +91 / 91
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.substring(2);
  }

  // Remove leading 0
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // Keep last 10 digits
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(-10);
  }

  return cleaned;

}
