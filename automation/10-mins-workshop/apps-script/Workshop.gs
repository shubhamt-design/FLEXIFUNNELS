/**
 * ============================================================
 * 10 MINS WORKSHOP - COMPLETE MASTER WORKFLOW
 * Spreadsheet: "Active Campaign List Upload 11 - 2026"
 * ============================================================
 *
 * WORKFLOW:
 *
 * 1. Create today's 5 sheets
 * 2. Import Zoom raw data into attendee(with buyers)
 * 3. Send Zoom data to Sorting Sheet
 * 4. Receive sorted data
 * 5. Time >= 1  -> attendee(with buyers)
 * 6. Time = 0   -> missed
 * 7. Fill missing phones in BOTH sheets
 * 8. Check With Buyers against BUYER LIST
 * 9. Remove matching buyers
 * 10. Remaining data -> attendee (w/o buyers)
 * 11. 60+ min -> pitch
 * 12. 1-59 min -> non-pitch
 * 13. Add Profession to Without Buyers
 *
 * INSTALL:
 * Open the spreadsheet -> Extensions -> Apps Script,
 * paste this file, save, reload the spreadsheet.
 * The "10 Mins Workshop" menu appears.
 * ============================================================
 */


/* ============================================================
   CONFIGURATION
   ============================================================ */

// Main spreadsheet (the 5 daily tabs are created here)
const MAIN_SPREADSHEET_ID =
  "1Ett6FqSVxHTxg_YbfVjXGVEdGr8w_Zjf9W9hsKl5SLQ";


// Sorting spreadsheet
const SORT_SPREADSHEET_ID =
  "1QFim-UvOdrt8tzkaMo0mC0Q4khA742KFrOTAMB6PF2s";

const SORT_INPUT_TAB =
  "Paste Raw Data";

const SORT_OUTPUT_TAB =
  "Attendees(DO NOT EDIT)";


// Buyer list spreadsheet
const BUYER_LIST_SPREADSHEET_ID =
  "186D8fAoGI0TiIUfyUroZsmYmeuBWha_Rh9QNBnvbzkk";


// Spreadsheet + tab containing the phone/profession source.
// The new spreadsheet has no Sheet62, so it is read from the
// previous main spreadsheet. Change these if Sheet62 moves.
const PHONE_SOURCE_SPREADSHEET_ID =
  "1xQEivSCmMv4WBpN8fqlLrisj8EXJBy0YLXzWAX58NhI";

const PHONE_SOURCE_TAB =
  "Sheet62";


// Time zone used for today's sheet names.
// (The spreadsheet itself is set to GMT.)
const WORKSHOP_TIME_ZONE =
  "Asia/Kolkata";


// Standard headers
const OUTPUT_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Time"
];


// Sorting wait
const SORT_MAX_WAIT_MS =
  60000;

const SORT_POLL_MS =
  1500;


/* ============================================================
   MENU
   ============================================================ */

function onOpen() {

  SpreadsheetApp
    .getUi()
    .createMenu("10 Mins Workshop")
    .addItem("Create Today's 5 Sheets", "createTodaysWorkshopSheets")
    .addSeparator()
    .addItem("RUN COMPLETE WORKFLOW", "runCompleteProcessing")
    .addSeparator()
    .addItem("Run Sorting Only", "runSortingOnly")
    .addItem("Run Phone Fill Only", "fillMissingPhones")
    .addItem("Run Buyer Removal Only", "runBuyerRemovalOnly")
    .addItem("Run Profession Only", "matchWorkshopAttendeesWithProfession")
    .addToUi();

}


/* ============================================================
   DATE PREFIX
   ============================================================ */

function getWorkshopDatePrefix_() {

  const now =
    new Date();

  const day =
    Utilities.formatDate(now, WORKSHOP_TIME_ZONE, "dd");

  const month =
    Utilities.formatDate(now, WORKSHOP_TIME_ZONE, "MMM").toUpperCase();

  const year =
    Utilities.formatDate(now, WORKSHOP_TIME_ZONE, "yyyy");

  return `${day} ${month} ${year} 10 Mins Workshop`;

}


/* ============================================================
   TODAY'S SHEET NAMES
   ============================================================ */

function getWorkshopSheetNames_() {

  const prefix =
    getWorkshopDatePrefix_();

  return {
    buyers:        `${prefix} attendee(with buyers)`,
    withoutBuyers: `${prefix} attendee (w/o buyers)`,
    pitch:         `${prefix} pitch`,
    nonPitch:      `${prefix} non-pitch`,
    missed:        `${prefix} missed`
  };

}


/* ============================================================
   PHONE SOURCE SHEET (Sheet62)
   ============================================================ */

function getPhoneSourceSheet_() {

  const sheet =
    SpreadsheetApp
      .openById(PHONE_SOURCE_SPREADSHEET_ID)
      .getSheetByName(PHONE_SOURCE_TAB);

  if (!sheet) {
    throw new Error(PHONE_SOURCE_TAB + " not found.");
  }

  return sheet;

}


/* ============================================================
   CREATE TODAY'S 5 SHEETS
   ============================================================ */

function createTodaysWorkshopSheets() {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const names =
    getWorkshopSheetNames_();

  const sheetNames = [
    names.buyers,
    names.withoutBuyers,
    names.pitch,
    names.nonPitch,
    names.missed
  ];

  sheetNames.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      ss.insertSheet(name);
    }
  });

  SpreadsheetApp
    .getUi()
    .alert(
      "Today's 5 sheets are ready.\n\n" +
      sheetNames.join("\n") +
      "\n\nImport your Zoom raw data into:\n" +
      names.buyers
    );

}


/* ============================================================
   COMPLETE WORKFLOW
   ============================================================ */

function runCompleteProcessing() {

  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    SpreadsheetApp.getUi().alert("Another workflow is already running.");
    return;
  }

  try {

    const ss =
      SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

    const names =
      getWorkshopSheetNames_();

    const buyersSheet        = ss.getSheetByName(names.buyers);
    const withoutBuyersSheet = ss.getSheetByName(names.withoutBuyers);
    const pitchSheet         = ss.getSheetByName(names.pitch);
    const nonPitchSheet      = ss.getSheetByName(names.nonPitch);
    const missedSheet        = ss.getSheetByName(names.missed);

    if (
      !buyersSheet ||
      !withoutBuyersSheet ||
      !pitchSheet ||
      !nonPitchSheet ||
      !missedSheet
    ) {
      throw new Error(
        "Today's 5 sheets are missing.\n\n" +
        "Please run 'Create Today's 5 Sheets' first."
      );
    }

    if (buyersSheet.getLastRow() < 2) {
      throw new Error("No Zoom raw data found in:\n\n" + names.buyers);
    }

    toast_("STEP 1/6", "Sending Zoom data to sorting sheet...");
    sortWithBuyersData_();

    toast_("STEP 2/6", "Separating attendees and missed...");
    splitSortedAttendees_();

    toast_("STEP 3/6", "Filling missing phone numbers...");
    fillMissingPhones_(false);

    toast_("STEP 4/6", "Removing buyers from With Buyers...");
    removeBuyersAndCreateWithoutBuyers_();

    toast_("STEP 5/6", "Creating Pitch and Non-Pitch...");
    createPitchAndNonPitch_();

    toast_("STEP 6/6", "Matching Profession...");
    matchWorkshopAttendeesWithProfession_(false);

    SpreadsheetApp
      .getUi()
      .alert(
        "COMPLETE WORKFLOW FINISHED\n\n" +
        "✓ Zoom data sorted\n" +
        "✓ Time >= 1 → With Buyers\n" +
        "✓ Time = 0 → Missed\n" +
        "✓ Phones filled in both\n" +
        "✓ Buyers removed\n" +
        "✓ Without Buyers created\n" +
        "✓ Pitch created\n" +
        "✓ Non-Pitch created\n" +
        "✓ Profession added\n\n" +
        "Today's workflow is complete."
      );

  }

  catch (error) {

    Logger.log(error.stack || error);

    SpreadsheetApp
      .getUi()
      .alert("WORKFLOW STOPPED\n\n" + error.message);

  }

  finally {

    lock.releaseLock();

  }

}


/* ============================================================
   SORTING ONLY
   ============================================================ */

function runSortingOnly() {

  try {

    sortWithBuyersData_();
    splitSortedAttendees_();

    SpreadsheetApp
      .getUi()
      .alert(
        "Sorting completed.\n\n" +
        "Time >= 1 → With Buyers\n" +
        "Time = 0 → Missed"
      );

  }

  catch (error) {

    SpreadsheetApp.getUi().alert("Sorting failed:\n\n" + error.message);

  }

}


/* ============================================================
   SORT ZOOM DATA
   ============================================================ */

function sortWithBuyersData_() {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const names =
    getWorkshopSheetNames_();

  const buyersSheet =
    ss.getSheetByName(names.buyers);

  const data =
    buyersSheet.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error("No Zoom data found.");
  }

  /*
   * Find Zoom header row
   */

  let headerRow = -1;

  for (let i = 0; i < data.length; i++) {

    const row =
      data[i].map(function(x) { return String(x).trim(); });

    if (
      row.includes("User Name (Original Name)") &&
      row.includes("Email") &&
      row.includes("Phone") &&
      row.includes("Time in Session (minutes)")
    ) {
      headerRow = i;
      break;
    }

  }

  if (headerRow === -1) {
    throw new Error(
      "Zoom headers not found.\n\n" +
      "Required headers:\n" +
      "User Name (Original Name)\n" +
      "Email\n" +
      "Phone\n" +
      "Time in Session (minutes)"
    );
  }

  const headers =
    data[headerRow].map(function(x) { return String(x).trim(); });

  const nameIndex  = headers.indexOf("User Name (Original Name)");
  const emailIndex = headers.indexOf("Email");
  const phoneIndex = headers.indexOf("Phone");
  const timeIndex  = headers.indexOf("Time in Session (minutes)");

  const cleaned = [
    OUTPUT_HEADERS
  ];

  for (let i = headerRow + 1; i < data.length; i++) {

    const row = data[i];

    const name  = row[nameIndex] || "";
    const email = row[emailIndex] || "";
    const phone = normalizePhone_(row[phoneIndex]);
    const time  = parseTime_(row[timeIndex]);

    if (
      !String(name).trim() &&
      !String(email).trim() &&
      !phone &&
      time === 0
    ) {
      continue;
    }

    cleaned.push([name, email, phone, time]);

  }

  /*
   * Open sorting spreadsheet
   */

  const sortSS =
    SpreadsheetApp.openById(SORT_SPREADSHEET_ID);

  const input =
    sortSS.getSheetByName(SORT_INPUT_TAB);

  const output =
    sortSS.getSheetByName(SORT_OUTPUT_TAB);

  if (!input) {
    throw new Error("Sorting input tab not found: " + SORT_INPUT_TAB);
  }

  if (!output) {
    throw new Error("Sorting output tab not found: " + SORT_OUTPUT_TAB);
  }

  input.clearContents();

  input
    .getRange(1, 1, cleaned.length, 4)
    .setValues(cleaned);

  SpreadsheetApp.flush();

  /*
   * Wait for sorting result
   */

  let sorted = [];

  const start =
    Date.now();

  while (Date.now() - start < SORT_MAX_WAIT_MS) {

    Utilities.sleep(SORT_POLL_MS);

    SpreadsheetApp.flush();

    const outputData =
      output.getDataRange().getValues();

    if (outputData.length > 1) {

      // Keep only real people: Name, Email or Phone must be present.
      // Formula rows that show #N/A (and Time 0) are ignored.
      const rows =
        outputData
          .slice(1)
          .filter(function(row) {
            return [row[0], row[1], row[2]].some(function(x) {
              return String(cleanCell_(x)).trim() !== "";
            });
          });

      if (rows.length) {
        sorted = rows;
        break;
      }

    }

  }

  if (!sorted.length) {
    throw new Error("Sorting sheet did not return any data.");
  }

  /*
   * Put sorted data back temporarily
   */

  const sortedData = [
    OUTPUT_HEADERS
  ];

  sorted.forEach(function(row) {
    sortedData.push([
      cleanCell_(row[0]),
      cleanCell_(row[1]),
      normalizePhone_(cleanCell_(row[2])),
      parseTime_(cleanCell_(row[3]))
    ]);
  });

  buyersSheet.clearContents();

  buyersSheet
    .getRange(1, 1, sortedData.length, 4)
    .setValues(sortedData);

}


/* ============================================================
   SPLIT SORTED DATA
   ============================================================ */

function splitSortedAttendees_() {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const names =
    getWorkshopSheetNames_();

  const buyersSheet =
    ss.getSheetByName(names.buyers);

  const missedSheet =
    ss.getSheetByName(names.missed);

  const data =
    buyersSheet.getDataRange().getValues();

  const attendees = [
    OUTPUT_HEADERS
  ];

  const missed = [
    OUTPUT_HEADERS
  ];

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    const name  = cleanCell_(row[0]);
    const email = cleanCell_(row[1]);
    const phone = normalizePhone_(cleanCell_(row[2]));
    const time  = parseTime_(cleanCell_(row[3]));

    // Skip empty / #N/A-only rows so they never reach Missed
    if (
      !String(name).trim() &&
      !String(email).trim() &&
      !phone
    ) {
      continue;
    }

    /*
     * Complete row stays together.
     */

    const cleanRow = [name, email, phone, time];

    if (time >= 1) {
      attendees.push(cleanRow);
    } else {
      missed.push(cleanRow);
    }

  }

  buyersSheet.clearContents();

  buyersSheet
    .getRange(1, 1, attendees.length, 4)
    .setValues(attendees);

  missedSheet.clearContents();

  missedSheet
    .getRange(1, 1, missed.length, 4)
    .setValues(missed);

}


/* ============================================================
   PHONE FILL BUTTON
   ============================================================ */

function fillMissingPhones() {

  try {

    fillMissingPhones_(true);

  }

  catch (error) {

    SpreadsheetApp.getUi().alert("Phone Fill Failed\n\n" + error.message);

  }

}


/* ============================================================
   PHONE FILL
   BOTH WITH BUYERS + MISSED
   ============================================================ */

function fillMissingPhones_(showAlert) {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const sourceSheet =
    getPhoneSourceSheet_();

  const names =
    getWorkshopSheetNames_();

  const targetSheets = [
    ss.getSheetByName(names.buyers),
    ss.getSheetByName(names.missed)
  ];

  const sourceData =
    sourceSheet.getDataRange().getValues();

  if (sourceData.length < 2) {
    throw new Error(PHONE_SOURCE_TAB + " has no data.");
  }

  const sourceHeaders =
    sourceData[0].map(function(h) {
      return String(h).trim().toLowerCase();
    });

  const sourceEmailCol = sourceHeaders.indexOf("email");
  const sourcePhoneCol = sourceHeaders.indexOf("phone");

  if (sourceEmailCol === -1 || sourcePhoneCol === -1) {
    throw new Error(PHONE_SOURCE_TAB + " must contain Email and Phone.");
  }

  const sourceMap = {};

  for (let i = 1; i < sourceData.length; i++) {

    const email = normalizeEmail_(sourceData[i][sourceEmailCol]);
    const phone = normalizePhone_(sourceData[i][sourcePhoneCol]);

    if (email && phone.length === 10) {
      sourceMap[email] = phone;
    }

  }

  let totalUpdates = 0;

  targetSheets.forEach(function(sheet) {

    if (!sheet) return;

    const data =
      sheet.getDataRange().getValues();

    if (data.length < 2) return;

    const headers =
      data[0].map(function(h) {
        return String(h).trim().toLowerCase();
      });

    const emailCol = headers.indexOf("email");
    const phoneCol = headers.indexOf("phone");

    if (emailCol === -1 || phoneCol === -1) return;

    for (let i = 1; i < data.length; i++) {

      const email        = normalizeEmail_(data[i][emailCol]);
      const currentPhone = normalizePhone_(data[i][phoneCol]);

      if (
        currentPhone.length < 10 &&
        email &&
        sourceMap[email]
      ) {
        data[i][phoneCol] = sourceMap[email];
        totalUpdates++;
      }

    }

    sheet
      .getDataRange()
      .setValues(data);

  });

  if (showAlert) {
    SpreadsheetApp
      .getUi()
      .alert(
        "Phone Fill Completed.\n\n" +
        "Total Updated: " + totalUpdates
      );
  }

}


/* ============================================================
   BUYER REMOVAL ONLY BUTTON
   ============================================================ */

function runBuyerRemovalOnly() {

  try {

    const result =
      removeBuyersAndCreateWithoutBuyers_();

    createPitchAndNonPitch_();

    SpreadsheetApp
      .getUi()
      .alert(
        "Buyer Removal Completed.\n\n" +
        "With Buyers: " + result.total +
        "\nRemoved Buyers: " + result.removed +
        "\nWithout Buyers: " + result.kept
      );

  }

  catch (error) {

    SpreadsheetApp.getUi().alert("Buyer Removal Failed\n\n" + error.message);

  }

}


/* ============================================================
   BUYER REMOVAL
   ============================================================
 *
 * Reads:        Today's attendee(with buyers)
 * Compares to:  BUYER_LIST_SPREADSHEET_ID
 * Matching:     Email OR Phone
 * Matched:      Removed
 * Not matched:  Exact Name/Email/Phone/Time row kept
 * ============================================================ */

function removeBuyersAndCreateWithoutBuyers_() {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const names =
    getWorkshopSheetNames_();

  const buyersSheet =
    ss.getSheetByName(names.buyers);

  const withoutBuyersSheet =
    ss.getSheetByName(names.withoutBuyers);

  if (!buyersSheet) {
    throw new Error("Today's With Buyers sheet not found.");
  }

  if (!withoutBuyersSheet) {
    throw new Error("Today's Without Buyers sheet not found.");
  }

  const attendeeData =
    buyersSheet.getDataRange().getValues();

  if (attendeeData.length < 2) {
    throw new Error("With Buyers contains no attendees.");
  }

  const buyerSS =
    SpreadsheetApp.openById(BUYER_LIST_SPREADSHEET_ID);

  const buyerInfo =
    findBuyerSheet_(buyerSS);

  if (!buyerInfo) {
    throw new Error(
      "Could not find a buyer sheet containing Email or Phone headers."
    );
  }

  const buyerData =
    buyerInfo.sheet.getDataRange().getValues();

  if (buyerData.length < 2) {

    /*
     * No buyers means keep everyone.
     */

    writeWithoutBuyers_(withoutBuyersSheet, attendeeData);

    return {
      total:   attendeeData.length - 1,
      removed: 0,
      kept:    attendeeData.length - 1
    };

  }

  const buyerHeaders =
    buyerData[0].map(function(h) {
      return String(h).trim().toLowerCase();
    });

  const buyerEmailCol = buyerHeaders.indexOf("email");
  const buyerPhoneCol = buyerHeaders.indexOf("phone");

  const buyerEmails = {};
  const buyerPhones = {};

  for (let i = 1; i < buyerData.length; i++) {

    if (buyerEmailCol !== -1) {
      const email = normalizeEmail_(buyerData[i][buyerEmailCol]);
      if (email) {
        buyerEmails[email] = true;
      }
    }

    if (buyerPhoneCol !== -1) {
      const phone = normalizePhone_(buyerData[i][buyerPhoneCol]);
      if (phone.length === 10) {
        buyerPhones[phone] = true;
      }
    }

  }

  const withoutBuyers = [
    OUTPUT_HEADERS
  ];

  let removed = 0;

  for (let i = 1; i < attendeeData.length; i++) {

    const row = attendeeData[i];

    const name  = row[0] || "";
    const email = normalizeEmail_(row[1]);
    const phone = normalizePhone_(row[2]);
    const time  = parseTime_(row[3]);

    if (!String(name).trim() && !email && !phone) {
      continue;
    }

    const matchedByEmail = email && buyerEmails[email];
    const matchedByPhone = phone && buyerPhones[phone];

    if (matchedByEmail || matchedByPhone) {
      removed++;
      continue;
    }

    /*
     * KEEP EXACT CORRESPONDING DATA
     */

    withoutBuyers.push([
      name,
      row[1] || "",
      row[2] || "",
      time
    ]);

  }

  writeWithoutBuyers_(withoutBuyersSheet, withoutBuyers);

  return {
    total:   attendeeData.length - 1,
    removed: removed,
    kept:    withoutBuyers.length - 1
  };

}


/* ============================================================
   FIND BUYER SHEET
   ============================================================
 *
 * Preference:
 * 1. Tab with BOTH Email and Phone
 * 2. Tab with Email
 * 3. Tab with Phone
 * ============================================================ */

function findBuyerSheet_(spreadsheet) {

  const tabs =
    spreadsheet
      .getSheets()
      .filter(function(sheet) {
        return sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1;
      })
      .map(function(sheet) {
        return {
          sheet: sheet,
          headers: sheet
            .getRange(1, 1, 1, sheet.getLastColumn())
            .getValues()[0]
            .map(function(h) {
              return String(h).trim().toLowerCase();
            })
        };
      });

  const checks = [
    function(h) { return h.indexOf("email") !== -1 && h.indexOf("phone") !== -1; },
    function(h) { return h.indexOf("email") !== -1; },
    function(h) { return h.indexOf("phone") !== -1; }
  ];

  for (let c = 0; c < checks.length; c++) {
    for (let i = 0; i < tabs.length; i++) {
      if (checks[c](tabs[i].headers)) {
        return tabs[i];
      }
    }
  }

  return null;

}


/* ============================================================
   WRITE WITHOUT BUYERS
   ============================================================ */

function writeWithoutBuyers_(sheet, data) {

  sheet.clearContents();

  sheet
    .getRange(1, 1, data.length, 4)
    .setValues(data);

}


/* ============================================================
   CREATE PITCH / NON-PITCH
   ============================================================ */

function createPitchAndNonPitch_() {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const names =
    getWorkshopSheetNames_();

  const withoutBuyersSheet = ss.getSheetByName(names.withoutBuyers);
  const pitchSheet         = ss.getSheetByName(names.pitch);
  const nonPitchSheet      = ss.getSheetByName(names.nonPitch);

  const data =
    withoutBuyersSheet.getDataRange().getValues();

  const pitch = [
    OUTPUT_HEADERS
  ];

  const nonPitch = [
    OUTPUT_HEADERS
  ];

  for (let i = 1; i < data.length; i++) {

    const row = data[i];

    const time = parseTime_(row[3]);

    const cleanRow = [
      row[0] || "",
      row[1] || "",
      row[2] || "",
      time
    ];

    if (time >= 60) {
      pitch.push(cleanRow);          // 60+ = Pitch
    } else if (time >= 1) {
      nonPitch.push(cleanRow);       // 1-59 = Non-Pitch
    }

  }

  pitchSheet.clearContents();

  pitchSheet
    .getRange(1, 1, pitch.length, 4)
    .setValues(pitch);

  nonPitchSheet.clearContents();

  nonPitchSheet
    .getRange(1, 1, nonPitch.length, 4)
    .setValues(nonPitch);

}


/* ============================================================
   PROFESSION BUTTON
   ============================================================ */

function matchWorkshopAttendeesWithProfession() {

  try {

    matchWorkshopAttendeesWithProfession_(true);

  }

  catch (error) {

    SpreadsheetApp
      .getUi()
      .alert("Profession Matching Failed\n\n" + error.message);

  }

}


/* ============================================================
   PROFESSION MATCHING
   ============================================================ */

function matchWorkshopAttendeesWithProfession_(showAlert) {

  const ss =
    SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);

  const sourceSheet =
    getPhoneSourceSheet_();

  const names =
    getWorkshopSheetNames_();

  const targetSheet =
    ss.getSheetByName(names.withoutBuyers);

  if (!targetSheet) {
    throw new Error("Today's Without Buyers sheet not found.");
  }

  const sourceData =
    sourceSheet.getDataRange().getValues();

  if (sourceData.length < 2) {
    throw new Error(PHONE_SOURCE_TAB + " has no data.");
  }

  const sourceHeaders =
    sourceData[0].map(function(h) {
      return String(h).trim().toLowerCase();
    });

  const emailCol      = sourceHeaders.indexOf("email");
  const phoneCol      = sourceHeaders.indexOf("phone");
  const professionCol = sourceHeaders.indexOf("profession");

  if (emailCol === -1 || phoneCol === -1 || professionCol === -1) {
    throw new Error(
      PHONE_SOURCE_TAB + " must contain:\n" +
      "Email\n" +
      "Phone\n" +
      "Profession"
    );
  }

  const emailMap = {};
  const phoneMap = {};

  for (let i = 1; i < sourceData.length; i++) {

    const email = normalizeEmail_(sourceData[i][emailCol]);
    const phone = normalizePhone_(sourceData[i][phoneCol]);
    const profession = String(sourceData[i][professionCol] || "").trim();

    if (email && profession) {
      emailMap[email] = profession;
    }

    // Only full 10-digit phones, so partial numbers can't mismatch.
    if (phone.length === 10 && profession) {
      phoneMap[phone] = profession;
    }

  }

  const lastRow =
    targetSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error("Without Buyers has no data.");
  }

  /*
   * Read only A:D. Existing data is not touched.
   */

  const data =
    targetSheet
      .getRange(1, 1, lastRow, 4)
      .getValues();

  const professionResults = [
    ["Profession"]
  ];

  let matchedByEmail = 0;
  let matchedByPhone = 0;
  let notMatched = 0;

  for (let i = 1; i < data.length; i++) {

    const email = normalizeEmail_(data[i][1]);
    const phone = normalizePhone_(data[i][2]);

    let profession = "";

    if (email && emailMap[email]) {
      profession = emailMap[email];
      matchedByEmail++;
    } else if (phone && phoneMap[phone]) {
      profession = phoneMap[phone];
      matchedByPhone++;
    } else {
      notMatched++;
    }

    professionResults.push([profession]);

  }

  /*
   * A = Name, B = Email, C = Phone, D = Time, E = Profession
   */

  targetSheet
    .getRange(1, 5, professionResults.length, 1)
    .setValues(professionResults);

  if (showAlert) {
    SpreadsheetApp
      .getUi()
      .alert(
        "Profession Matching Completed.\n\n" +
        "Matched by Email: " + matchedByEmail +
        "\nMatched by Phone: " + matchedByPhone +
        "\nNot Matched: " + notMatched
      );
  }

}


/* ============================================================
   CLEAN CELL
   ============================================================
 * Turns spreadsheet error values (#N/A, #REF!, #VALUE!, ...)
 * and null/undefined into "". Other values are returned as-is.
 * ============================================================ */

function cleanCell_(value) {

  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" &&
    /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!)/i.test(value.trim())
  ) {
    return "";
  }

  return value;

}


/* ============================================================
   NORMALIZE EMAIL
   ============================================================ */

function normalizeEmail_(email) {

  if (!email) {
    return "";
  }

  return String(email).trim().toLowerCase();

}


/* ============================================================
   NORMALIZE PHONE
   ============================================================ */

function normalizePhone_(phone) {

  if (!phone) {
    return "";
  }

  let cleaned =
    String(phone).replace(/\D/g, "");

  // Indian +91
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.substring(2);
  }

  // Leading zero
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // Keep last 10 digits
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(-10);
  }

  return cleaned;

}


/* ============================================================
   TIME PARSER
   ============================================================ */

function parseTime_(value) {

  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  const match =
    String(value).trim().match(/-?\d+(\.\d+)?/);

  if (!match) {
    return 0;
  }

  return Number(match[0]) || 0;

}


/* ============================================================
   TOAST
   ============================================================ */

function toast_(title, message) {

  SpreadsheetApp
    .openById(MAIN_SPREADSHEET_ID)
    .toast(message, title, 10);

}
