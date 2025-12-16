# BACKEND-002: Implement External Adapter Interface (Facade Pattern)

## Goal Description
Create an abstraction layer (Adapter Pattern) for external services (Email, AI) to decouple business logic from specific implementations. This allows for future switching to different providers (e.g., SendGrid, OpenAI) without changing core logic.

## User Review Required
> [!NOTE]
> - `src/api/reservation/services/email.ts` will be refactored to delegate logic to `LocalEmailAdapter`.
> - Existing email logic (Nodemailer) will be moved to `src/adapters/email/local.ts`.
> - A dummy AI adapter will be created at `src/adapters/ai/dummy.ts`.

## Proposed Changes

### Adapter Layer (`src/adapters`)
#### [NEW] `src/adapters/interfaces`
- `email.ts`: `EmailAdapter` interface definition.
- `ai.ts`: `AIAdapter` interface definition.

#### [NEW] `src/adapters/email/local.ts`
- `LocalEmailAdapter` class implementing `EmailAdapter`.
- Contains the existing Nodemailer logic extracted from `src/api/reservation/services/email.ts`.

#### [NEW] `src/adapters/ai/dummy.ts`
- `DummyAIAdapter` class implementing `AIAdapter`.
- Returns fixed dummy strings.

#### [NEW] `src/adapters/factory.ts`
- Factory to instantiate and return adapters.

### Service Refactoring
#### [MODIFY] `src/api/reservation/services/email.ts`
- Remove raw Nodemailer logic.
- Import `EmailAdapter` from `src/adapters`.
- Instantiate `LocalEmailAdapter` via factory and delegate calls.

## Verification Plan
### Automated Tests
- **Email Test**:
    - Trigger an email sending action (e.g., create a test reservation or use `api/email-test` if available).
    - Verify logs or use usage of Ethereal email (if in dev) to confirm email was sent.
- **AI Test**:
    - Create a temporary script to instantiate `DummyAIAdapter` and call `analyzeNotes`. Assert return value is the dummy string.

### Manual Verification
- Start Strapi.
- Perform a reservation flow.
- Confirm email is "sent" (logged) exactly as before.
