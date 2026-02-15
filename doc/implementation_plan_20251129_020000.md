# Data Completeness Heatmap Implementation Plan

## Goal
Add a data completeness heatmap to the Developer Dashboard to visualize store data quality at a glance.

## Proposed Changes

### Frontend (Next.js)
#### [MODIFY] [api.ts](file:///e:/15.app_sumaho_uketsuke/frontend/lib/api.ts)
- Update `getStores()` to populate `menuItems` count or full data for completeness check.

#### [MODIFY] [Developer Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/developer/page.tsx)
- Add "充実度" column with 4 icons:
  - **📷 Brand**: `logoImage` or `coverImage` exists
  - **🕒 Hours**: `businessHours` is set
  - **📍 Map**: `address` exists
  - **🍽️ Menu**: `menuItems` count > 0
- Color coding: Green (data exists) / Gray or Red (missing)
- Add tooltips for each icon
- Make icons clickable to open preview modal (if preview modal exists)

## Verification Plan
### Manual Verification
1. Access `/developer`
2. Verify heatmap icons display correctly
3. Verify color coding reflects actual data
4. Verify tooltips show on hover
5. Verify clicking icons opens preview (if implemented)
