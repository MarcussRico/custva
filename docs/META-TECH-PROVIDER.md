# Applying for Meta Tech Provider status

Tech Provider is what makes **Embedded Signup** possible — the merchant clicks
once, logs into Facebook, picks their number, and Custva receives their
credentials. Without it, an operator connects each merchant by hand through
`POST /admin/merchants/:id/whatsapp`, which works but does not scale past a
pilot.

This has to be done by someone with the company's Business Manager login and
its legal documents. It cannot be automated.

## The order matters

Each step gates the next. Doing them out of order wastes weeks.

### 1. Meta Business Portfolio
business.facebook.com. Probably already exists.

### 2. Business verification — **start this first**
Business settings → Security Centre → Start Verification.

The long pole: **days to weeks**. Nothing else can proceed without it, and
nothing about it goes faster by waiting. Needs:

- Certificate of incorporation or GST registration
- A business bank statement or utility bill at the registered address
- A phone number and website domain that resolve to the business

The website matters — Meta checks that the domain in the application is the one
serving the site. `custva.com` must be live and must show the legal entity name.

### 3. Create a Business-type app with the WhatsApp product
developers.facebook.com → Create App → Business.

Note the **App ID** (`WA_APP_ID`) and **App Secret** (`WA_APP_SECRET`) at this
point — the App ID is a third id, distinct from the phone number id and the
WhatsApp Business Account id, and confusing the three is the most common way
this setup fails.

### 4. Fill in the app's Basic Settings — **built, needs filling in**

| Meta field | Use |
|---|---|
| Privacy Policy URL | `https://custva.com/privacy` |
| Terms of Service URL | `https://custva.com/terms` |
| Data Deletion Request URL | `https://api.custva.com/api/v1/webhooks/data-deletion` |
| User Data Deletion instructions | `https://custva.com/data-deletion` |
| App Icon | 1024×1024 PNG |
| Category | Business |

All three pages exist in this repo. **They contain placeholders that must be
replaced before submitting** — legal entity name, registered address, grievance
officer, contact email, hosting region, commission rate, jurisdiction. They are
highlighted in yellow on the page so they cannot ship unnoticed.

They have not been reviewed by a lawyer. The DPDP Act's requirements around a
Data Protection Officer, cross-border transfer and consent notices in local
languages need someone qualified to sign off.

### 5. Set the Tech Provider designation
Business settings → Business Info → Business Type → **Tech Provider**.
Self-serve, but only available after verification.

### 6. App Review for the two WhatsApp permissions
`whatsapp_business_management` and `whatsapp_business_messaging`, both at
**Advanced Access**. Needs a screencast per permission showing it in use in the
product — the admin template screen submitting a template covers the first, and
a campaign send covers the second.

### 7. Accept the WhatsApp Business Solution Terms
Appears in Business settings once the above is done.

## What is already built

- `/privacy`, `/terms`, `/data-deletion` pages
- `POST /api/v1/webhooks/data-deletion` — Meta's callback. Verifies the HMAC
  signature, destroys the merchant's stored WhatsApp credential, stops sending,
  and returns the confirmation code Meta shows the person. Deliberately does
  **not** delete a shop's customer records: those belong to the shop, and Meta
  removing an app is not the shop asking for its book to be deleted.
- `GET /api/v1/webhooks/data-deletion/status?code=…` — the status lookup behind
  that confirmation code.
- `POST /admin/merchants/:id/whatsapp` — takes exactly the fields Embedded
  Signup's callback returns, so that flow drops onto the existing endpoint
  rather than replacing it.

## What is still a product decision

**Registering a number with the Cloud API removes it from WhatsApp and WhatsApp
Business on the owner's phone.** Most small shops run their business on that
number, so "just give us your number" in practice means "a second number you do
not already use".

Decide before onboarding whether Custva supplies the SIM or the onboarding
script asks the merchant to bring one. It is the single most likely thing to
stall a merchant halfway through signup.
