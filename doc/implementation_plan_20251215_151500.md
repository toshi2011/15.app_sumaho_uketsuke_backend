# FRONTEND-001: Implement Feature Toggling (useModule Hook)

## Goal Description
Enable the frontend to dynamically show/hide features based on the store's subscription settings (Modules).

## Proposed Changes

### Types (`frontend/types/index.ts`)
#### [NEW] `Module`
- `slug`: string
- `name`: string
- `monthlyPrice`: number

#### [NEW] `StoreModule`
- `module`: Module
- `isEnabled`: boolean
- `settings`: any

#### [MODIFY] `Store`
- Add `store_modules`: StoreModule[]

### API (`frontend/lib/api.ts`)
#### [MODIFY] `getStoreInfo`
- Update URL to populate nested modules: `populate[store_modules][populate]=module` (or `populate=*` if it handles it, but explicit is safer).
- Map response to match the updated `Store` type.

### Context & Hook (`frontend/context`, `frontend/hooks`)
#### [NEW] `frontend/contexts/ModuleContext.tsx`
- `ModuleContext`: Holds the list of active modules and settings.
- `ModuleProvider`: specific to a store.

#### [NEW] `frontend/hooks/useModule.ts`
- `useModule(moduleSlug: string)`: returns `{ isEnabled: boolean, settings: any }`.

### Integration
#### [MODIFY] `frontend/app/store/[storeId]/page.tsx`
- Retrieve `store` data.
- Wrap content in `ModuleProvider` if I can, OR just use the hook if `page.tsx` is valid.
- *Note:* Since there is no `layout.tsx` in `[storeId]`, I might need to create one `frontend/app/store/[storeId]/layout.tsx` to handle the Provider centrally for all sub-pages (`/menu`, `/reservation` etc), OR just wrap the specific page components. Creating a layout is cleaner.

### Refactor UI (PoC)
#### [MODIFY] `frontend/app/store/[storeId]/menu/page.tsx` or similar
- Use `useModule('menu_management')` as an example (if that module exists, or just `reservation_basic` for now).
- If disabled, show "Feature Disabled".

## Verification Plan
### Manual Verification
1. **Enable/Disable Module**:
   - Manually edit the database (or use Strapi Admin if available) to set `store_modules.isEnabled = false` for a specific store.
2. **Verify Frontend**:
   - Reload the store page.
   - Confirm the feature (e.g. Menu link) is hidden or disabled.
