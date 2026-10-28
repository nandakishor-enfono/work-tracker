# My Work Log (Company Sheet Compatible)

A personal, local-first daily work tracker built with React, TypeScript, and Vite. Designed to track daily work and copy tasks directly into company Google Sheets.

## Features

- **Direct Google Sheet Copying**: Instant one-click "Copy for Google Sheet" button that puts tab-separated rows onto your clipboard. Select cell A1 (or your first empty row) in Google Sheets and press `Ctrl+V`.
- **Exact Company Google Sheet Columns (9 columns)**:
  1. `No.` (sequential row number: `1`, `2`, `3`...)
  2. `Date` (`DD-MMM-YY`, e.g. `24-Oct-26`, `26-Oct-26`)
  3. `Task` (`A Today's Work`, `B Tomorrow's Plan`, `C Leave`)
  4. `Module / Area` (Administration, General Ledger, Fixed Assets, HR/Payroll, Inventory, Shipping, Training Management, Vendor & Account Payable, CRM+Lead Mgmt)
  5. `Activity` (The full task / work description)
  6. `Work Done / Outcome` (Status DDL: `A Completed`, `B In Progress`, `C Pending, awaiting action`, `D Issues reported, I will fix`, `E On Hold- intentionally paused.`, `F Blocked, cannot proceed`, or blank)
  7. `Time Spent (hrs)` (Decimal hours e.g. `2.00`, `1.00`, or blank for plans)
  8. `Type` (`Bug Fixing`, `Development`, `Investigation`, `Meeting / Discussion`, `Testing`, `Training`, or blank)
  9. `Ticket / Reference / Remarks` (e.g. `PS-1585 - Posting screens Create/Edit`)
- **Row Reordering (Custom Row Positioning)**: Change row positions directly using the Move Up / Move Down arrow buttons or drag-and-drop handles. Rows paste into Google Sheets in your exact custom sequence.
- **Internal App Remarks (Private / App-Only)**: A personal notes field in the app for your own reminders and tracking that is **never copied** to the company Google Sheet.
- **Daily and Monthly Views**: View by selected day or browse total hours and active days for the month.
- **Filters & Search**: Fast filtering across activities, tickets, internal remarks, task category, modules, types, and outcomes.
- **Copy Individual Rows**: Copy single tasks directly for Google Sheets or duplicate to the current date.
- **Local-Only & Private**: Everything stays in your browser's local storage.
- **JSON & CSV Backups**: Export full JSON backups (including internal remarks), import past records, or export visible records to CSV.

## Run on Windows

1. Install Node.js (LTS).
2. Open PowerShell in `personal-work-tracker`.
3. Run:

   ```powershell
   npm install
   npm run dev
   ```

4. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Pasting into Google Sheets

1. In the app, select the day or filter the tasks you want to submit.
2. Click the green **Copy for Google Sheet** button (or the copy icon on any specific row).
3. Open your company Google Sheet.
4. Click on the first column (`No.`) of the row where you want to add the entries.
5. Press `Ctrl + V` (paste). The 9 columns will fill the respective cells cleanly.
