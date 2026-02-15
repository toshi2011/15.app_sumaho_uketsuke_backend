# Sales CRM & AI Prompt Generator Implementation Plan

## Goal
Implement a "Developer Dashboard" with a simple CRM to manage sales activities for each store and generate AI prompts for consultation.

## Proposed Changes

### Backend (Strapi)
#### [NEW] [sales-log schema](file:///e:/15.app_sumaho_uketsuke/backend/src/api/sales-log/content-types/sales-log/schema.json)
- Create a new Collection Type `SalesLog` to store sales history.
- Fields:
  - `date`: DateTime
  - `action`: Enumeration (DM, Call, Visit)
  - `result`: Enumeration (NoAnswer, Good, Bad, Contract)
  - `note`: Text
  - `store`: Relation (Many-to-One with Store)

#### [MODIFY] [store schema](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
- Add `ownerInfo` (JSON) field to store owner attributes (gender, ageRange, personality).
- Add `salesLogs` (One-to-Many relation) to `SalesLog`.

### Frontend (Next.js)
#### [NEW] [Developer Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/developer/page.tsx)
- Create a new page for the Developer Dashboard.
- Fetch and display a list of all stores.
- Implement the CRM UI (Owner Info Input, 1-Tap Log Buttons, AI Prompt Generator).

#### [MODIFY] [api.ts](file:///e:/15.app_sumaho_uketsuke/frontend/lib/api.ts)
- Add `getStores()` to fetch all stores.
- Add `createSalesLog()` to save logs.
- Update `Store` interface in `types/index.ts`.

## Verification Plan
### Automated Tests
- None (Manual verification).

### Manual Verification
1.  **Backend**: Restart Strapi and verify `SalesLog` collection and `Store` updates in Admin Panel.
2.  **Frontend**:
    - Access `/developer`.
    - Verify list of stores is displayed.
    - Test "Quick Input" for Owner Info -> Verify update in Strapi.
    - Test "1-Tap Log Buttons" -> Verify new `SalesLog` entry in Strapi.
    - Test "Ask AI" -> Verify clipboard content matches the template.
