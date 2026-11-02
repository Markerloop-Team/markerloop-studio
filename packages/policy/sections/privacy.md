# Markerloop Privacy Policy

Version: 0.4 · Effective date: 19 October 2026

## 1. Who is responsible for your data

Alisher Toleberdyyev, a sole proprietor (individual entrepreneur) registered in the Republic of Kazakhstan under the business name "Markerloop" (registration details omitted from this public snapshot), contact support@markerloop.com ("Markerloop", "we") is the controller of the personal data described in sections 3–9.

Privacy contact: support@markerloop.com.

## 2. Two different roles

- Your account and your use of Markerloop. We decide why and how this data is used. We are the controller. Most of this policy is about this data.
- Data that Markerloop users collect on their own Sites. When someone builds a Site on Markerloop and a Visitor sends data through it — for example a contact form — the owner of that Site is the controller and we only store the data on their behalf. If you sent data through such a Site, ask its owner first. Section 10 explains more.

## 3. What we collect

### 3.1 You give it to us

| Data | When | Notes |
|---|---|---|
| Username | registration | required |
| Email address | registration | optional at registration; needed for password reset and invitations |
| Password | registration | stored only as a bcrypt hash; we cannot read it |
| Email verified flag and time | when you confirm your email | |
| Accepted version of the Terms, the time of acceptance, and your IP address and browser user agent at that moment | registration and each new version | kept as proof of consent in a log that is never overwritten; erased together with your account |
| Content you create: records, files (with original file name, size, type, image dimensions), pages | using the Service | may contain personal data if you put it there |
| Email addresses of people you invite to a workspace | sending an invitation | we also keep a log of who sent an invitation to which address and when |

### 3.2 From a sign-in provider, if you use one

| Provider | What we receive and store |
|---|---|
| Google | Google account ID, email, name, profile picture address |
| Telegram (sign-in switched off in October 2026; data from earlier sign-ins is kept until the account is deleted) | Telegram ID, username, first and last name, language code, profile photo address |

### 3.3 Created automatically

| Data | Where | Kept for |
|---|---|---|
| IP address, browser user agent, request method, path, status | service request logs | {{limit:log_retention_days}} days |
| Email address and username in sign-in events; recipient address and subject of service emails | service logs | {{limit:log_retention_days}} days |
| IP address together with email, for limiting repeated sign-in attempts | short-lived cache | minutes to hours |
| Session tokens: only a hash of the refresh token with your user ID, username and email | short-lived cache | {{limit:refresh_token_hours}} hours after the last renewal |
| Who changed access rights, keys or members, and when | workspace audit log | while the workspace exists |
| Author of each page revision (user ID) | page history | while the page exists; for published versions, until the workspace is erased |
| Access keys you create: name, creator, last time used | database | until revoked and removed |
| Error reports: technical details of a failure; default sending of personal data is switched off | Sentry (EU region) | {{limit:sentry_retention_days}} days |

### 3.4 If you use the Telegram bot

We store your Telegram ID, username and display name, and keep a bot session for 7 days after your last use. The text of messages you send to the bot is not written to our logs.

### 3.5 Paid plans

There are no paid plans at the date of this version, and we do not process any payment data. If we introduce paid plans through a reseller, we will update this policy before anyone is charged.

### 3.6 What we do not do

- We do not sell personal data and do not share it for advertising.
- We do not use advertising or cross-site tracking cookies.
- We do not make decisions about you by automated means that have legal or similarly significant effects.
- We do not run visitor analytics on Sites built by our users.
- We do not run analytics or tracking on markerloop.com. If we ever add a privacy-friendly analytics tool, we will update this policy before enabling it.

## 4. Why we use your data and on what legal basis

| Purpose | Data | Legal basis (GDPR Art. 6) |
|---|---|---|
| Create your account, sign you in, provide the Service | account data, sign-in provider data, Content, session tokens, accepted Terms version | contract — 6(1)(b) |
| Send service emails: verification, password reset, invitations | email address | contract — 6(1)(b) |
| Keep the Service secure: rate limiting, logs, audit log, error reports | IP address, user agent, log data | legitimate interests in security and reliability — 6(1)(f) |
| Respond to legal requests and enforce our Terms | any data relevant to the request | legal obligation — 6(1)(c); legitimate interests — 6(1)(f) |
| Product announcements by email — only if we start sending them and you opt in; we do not send them today | email address | consent — 6(1)(a); you can withdraw at any time |

You are not required to give us data, but without a username and password we cannot create an account.

## 5. Cookies and similar storage

We use only what is needed for the application to work.

| Name | Purpose | Type | Lifetime |
|---|---|---|---|
| __Host-access_token | keeps you signed in | cookie, HttpOnly, SameSite=Strict | {{limit:access_token_hours}} hour |
| __Host-refresh_token | renews your session | cookie, HttpOnly, SameSite=Strict | {{limit:refresh_token_hours}} hours |
| __Host-NEXT_LOCALE | remembers interface language | cookie, SameSite=Lax | {{limit:locale_cookie_years}} year |
| __Host-ml_welcome_skipped | remembers that you chose "Skip for now" on the welcome screen; holds your account ID | cookie, SameSite=Lax | until you close the browser |
| locale, editor layout state | interface preferences | browser local storage | until you clear it |
| markerloop:product-notice:hidden:… | remembers that you chose "Hide" on an announcement; a new announcement has a new key | browser local storage | until you clear it |
| ml.invite.token | keeps an invitation link while you sign in or register to accept it | browser session storage (this tab only) | until it is used or you close the tab |
| ml.oauth.redirect | the page to return to after signing in with Google | browser session storage (this tab only) | until it is used or you close the tab |
| markerloop:billing:paid:… | the payment transaction ID right after a checkout, so a reload of the plan page does not lose it | browser session storage (this tab only) | until it is used or you close the tab |

Sites published by our users are served without cookies from Markerloop. If you open the Markerloop mini-app inside Telegram, a script from telegram.org is loaded.

## 6. Who receives your data

Service providers that process data on our instructions (processors) are listed in the table below. We update this section and tell you by email or in the application at least 15 days before a new provider starts processing your data.

| Provider | What for | Where |
|---|---|---|
| Hetzner Online GmbH (Gunzenhausen, Germany), under a data processing agreement under Article 28 GDPR concluded on 12 October 2026 | servers, databases, file storage, backups | Helsinki, Finland (EU) |
| Google (Google Workspace), the Google entity named in our Google Workspace agreement | delivery of service emails | Google may process this data in any country where Google or its subprocessors maintain facilities; transfers are covered by Google's Cloud Data Processing Addendum (an alternative transfer solution or, failing that, Standard Contractual Clauses) |
| Functional Software, Inc. d/b/a Sentry (San Francisco, USA) | error monitoring; default sending of personal data is switched off | Sentry's EU data region (Germany). Any transfer to the United States is covered by Sentry's certification under the EU–U.S. Data Privacy Framework, with Standard Contractual Clauses as fallback (Sentry Data Processing Addendum v5.1.0, 29 May 2024) |

Providers in the United States receive data only under a transfer mechanism recognised by Chapter V of the GDPR, as stated in each provider's data processing terms listed above.

Separate controllers:

- Google or Telegram, if you choose to sign in with them: that provider learns that you use Markerloop.

Other recipients:

- Members of your workspace see your username and what you did in the workspace.
- Anyone on the internet sees what you publish on a Site and files you mark as public.
- Authorities, when the law requires it. We check each request and give only what is required.
- A company that continues the Service, if Markerloop is transferred to a company, merged or sold. We will tell you before your data moves under a different privacy policy.

## 7. Where your data is stored and international transfers

Your account data, Content, files and backups are stored in Hetzner's data centre in Helsinki, Finland (EU).

Markerloop's operator works from Kazakhstan and accesses the data from there for support and maintenance. The European Commission has issued no adequacy decision for Kazakhstan. Markerloop is directly subject to the GDPR for this processing (Article 3(2)), and we apply the GDPR to it in full — the same rules on purposes, security, retention and your rights as if we were in the EU. The standard contractual clauses adopted by the Commission in 2021 are not designed for this situation (Decision (EU) 2021/914, recital 7); when the Commission adopts clauses for operators outside the EU that are subject to the GDPR, we will adopt them. Until then, the safeguards are: data stays on servers in the EU; access from Kazakhstan is limited to the operator and protected by personal credentials with two-factor authentication on every account that gives access to production data. You can ask us for details.

If you are in Kazakhstan: your data is stored outside Kazakhstan, in Finland. Section 13 explains what this means under Kazakhstan law.

## 8. How long we keep data

| Data | Kept until |
|---|---|
| Account data | you delete your account; then erased from live systems within {{limit:purge_hours}} hours |
| Content in a workspace | you delete it; a deleted workspace is kept for {{limit:trash_days}} days for restoration, then erased within {{limit:purge_hours}} hours |
| A single page, record or file | a record is erased when you delete it. A page or a file disappears from the workspace at once and cannot be restored, and the contents of the file are removed from live storage; the snapshots of the page's published versions and the record of the file (its name, size and type) stay until the workspace itself is erased |
| Backups and earlier file versions | {{limit:backup_days}} days; erased data, including the contents of deleted files, can remain in backup storage for up to 45 days |
| Logs | {{limit:log_retention_days}} days |
| Sign-in sessions | {{limit:refresh_token_hours}} hours after the last renewal |
| Invitation links | 7 days |
| Log of sent invitations | {{limit:invitation_log_days}} days |

## 9. Your rights

You can:

- see the data we hold about you and get a copy;
- correct data that is wrong;
- delete your account and data — yourself in Settings → Account, or by writing to us;
- restrict or object to processing based on our legitimate interests;
- move your data — receive it in a common machine-readable format; there is no self-service export yet, so we provide the copy on request within {{limit:content_copy_days}} days;
- withdraw consent where we rely on it, without affecting earlier processing.

Write to support@markerloop.com. We answer within one month; in complex cases we may take up to two further months and will tell you within the first month if so. We may ask you to confirm your identity. Using these rights is free.

If you are in the EEA, the UK or Switzerland you may also complain to the data protection authority of the country where you live or work. If you are in Kazakhstan, you may complain to the Committee for Information Security of the Ministry of Artificial Intelligence and Digital Development of the Republic of Kazakhstan (section 13).

We do not treat you differently for using your rights.

## 10. If you sent data through a Site built on Markerloop

The owner of that Site decides what happens with your data and must tell you about it in their own privacy notice. We store the data for them and do not use it for our own purposes.

What Markerloop itself processes when you visit such a Site: your IP address and browser user agent in request logs and for limiting abuse (section 3.3). We set no cookies and build no profile of you.

If the Site owner does not answer your request, write to us at support@markerloop.com and we will pass it on and help where we can.

For Site owners: the Data Processing Addendum in Annex B of the Terms applies to this data.

## 11. Security

- Connections to the Service are encrypted with TLS.
- Passwords are stored as bcrypt hashes. Session refresh tokens are stored only as hashes.
- Private files are reachable only through links that expire after 15 minutes.
- Production changes are made only through a version-controlled deployment process; superuser access to the production database is switched off.
- Production data is accessed only by the operator, for support and maintenance.

If a breach is likely to put your rights at risk, we will notify the competent authority within 72 hours of becoming aware of it and will tell you without undue delay where the risk is high.

## 12. Children

The Service is for people aged 18 and over. We do not knowingly collect data from children. If you believe a child has given us data, write to us and we will delete it.

## 13. Additional information for some regions

### Kazakhstan

Markerloop is operated by an individual entrepreneur registered in Kazakhstan, so the Law of the Republic of Kazakhstan "On Personal Data and Their Protection" No. 94-V applies to our processing in addition to the GDPR. Your data is stored in Finland (EU), as described in section 7; Kazakhstan law expects personal data to be stored in Kazakhstan (Article 12), and we are working on a copy of the data in a Kazakhstan data centre. Until then we apply the protection measures required of a small operator under the rules of the authorised body (order No. 179/НҚ) and the GDPR safeguards described in this policy.

By creating an account you give consent to the collection and processing of your personal data in the sense of Articles 7 and 8 of the Law: operator — Alisher Toleberdyyev, individual entrepreneur "Markerloop", registration details omitted; data — section 3; purposes — section 4; transfer to the providers in section 6 and cross-border storage in Finland — yes; publication in public sources — no, except Content you publish yourself; term — until you delete your account or withdraw consent. You may withdraw consent by deleting your account or writing to support@markerloop.com; we stop processing within 15 working days unless the law requires us to keep the data (Article 8(7)).

You may complain to the authorised body: the Committee for Information Security of the Ministry of Artificial Intelligence and Digital Development of the Republic of Kazakhstan. If a personal data breach occurs, we notify the authorised body within one working day of discovering it (Article 25(2)(8)) and you as described in section 11.

## 14. Changes to this policy

We will publish a new version with its effective date. If a change is significant we will tell you by email or in the application at least 15 days before it takes effect.

## 15. Contact

Alisher Toleberdyyev, individual entrepreneur "Markerloop", Republic of Kazakhstan, registration details omitted. Email: support@markerloop.com.
