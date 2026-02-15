# Sales CRM Enhancements Implementation Plan

## Goal
Enhance the Sales CRM to track store's digital presence (platform usage) and refine sales log actions for better AI-driven sales strategy.

## Proposed Changes

### Backend (Strapi)
#### [MODIFY] [store schema](file:///e:/15.app_sumaho_uketsuke/backend/src/api/store/content-types/store/schema.json)
- Add `digitalPresence` (JSON) field to store platform usage data.
  - Structure: `{ hasOwnHp, instagram, tiktok, tabelog, hotpepper, gurunavi, retty, googleMap, onlyPhone }`

### Frontend (Next.js)
#### [MODIFY] [types/index.ts](file:///e:/15.app_sumaho_uketsuke/frontend/types/index.ts)
- Update `Store` interface to include `digitalPresence`.
- Update `SalesLog` interface `action` type to include: `'SNS_DM' | 'Postal_DM' | 'Call' | 'Visit'`.

#### [MODIFY] [Developer Dashboard](file:///e:/15.app_sumaho_uketsuke/frontend/app/developer/page.tsx)
- **Platform Checkboxes**: Add checkboxes for `digitalPresence` in the store card.
- **Updated Quick Actions**: Replace generic "DM" with "SNS DM", "Postal DM", "Call", "Visit".
- **Enhanced AI Prompt**: Include `digitalPresence` info and specific instructions in the generated prompt.
- **Visuals**: Add platform icons to the store list for quick visibility.

## Verification Plan
### Manual Verification
1.  **Backend**: Restart Strapi and verify schema update.
2.  **Frontend**:
    - Access `/developer`.
    - Verify `digitalPresence` checkboxes work and save data.
    - Verify new Quick Action buttons save correct log types.
    - Verify "Ask AI" generates prompt with platform usage info and strategic advice request.
