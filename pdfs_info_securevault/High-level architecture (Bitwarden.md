High-level architecture (Bitwarden style)

This is the real structure behind the scenes:

Android App

├─ UI Layer (Jetpack / Activity / Fragment)
│
├─ Vault Layer
│   ├─ Cipher models
│   ├─ Domain index
│   └─ Search logic
│
├─ Crypto Layer
│   ├─ AES-256 encryption
│   ├─ PBKDF2 / Argon2 key derivation
│   └─ Master key handling
│
├─ Storage Layer
│   └─ Encrypted SQLite database
│
├─ Autofill Layer
│   ├─ AutofillService
│   ├─ SavePasswordService
│   └─ Dataset builder
│
└─ Platform Integration
    ├─ Android Keystore
    ├─ BiometricPrompt
    └─ Accessibility fallback

The vault never leaks outside these boundaries.

Vault data model

Every login item is called a Cipher in Bitwarden.

Example structure:

Cipher
{
  id
  name
  username
  password
  uris[]
  notes
}

The important part is URIs.

Example:

{
  name: "Amazon",
  username: "john@gmail.com",
  password: "encrypted...",
  uris: [
     "https://amazon.com",
     "https://signin.amazon.com"
  ]
}

These URIs power autofill matching.

Domain matching engine

This is the heart of autofill.

When an app requests autofill Android sends something like:

com.netflix.mediaclient

or

https://twitter.com/login

Bitwarden converts it into a normalized domain.

Example pipeline:

URL
↓
extract host
↓
remove subdomain
↓
public suffix match
↓
domain

Example results:

signin.amazon.co.uk
↓
amazon.co.uk

Then it searches vault entries.

Vault indexing (performance trick)

Scanning the entire vault every autofill request would be stupid.

So Bitwarden builds a domain index.

Structure:

Map<String, List<Cipher>>

Example:

amazon.com -> [Cipher1, Cipher2]
google.com -> [Cipher3]
twitter.com -> [Cipher4]

Autofill lookup becomes:

O(1)

instead of scanning 500 entries.

AutofillService lifecycle

Android calls:

onFillRequest()

Bitwarden then does this:

AutofillService
↓
parse form fields
↓
extract domain
↓
search vault index
↓
build datasets
↓
return suggestions

Dataset example:

Dataset
{
  label: "john@gmail.com"
  value: "password"
}

Android displays this in the autofill dropdown.

Unlock model

This part protects the vault.

Vault states:

LOCKED
UNLOCKED

Flow:

Autofill request
↓
Is vault locked?
↓
YES
↓
Prompt biometric
↓
Decrypt vault
↓
Return passwords

Bitwarden uses:

BiometricPrompt
+
Android Keystore

The master key never leaves secure hardware.

Crypto model

Vault encryption:

AES-256-GCM

Master key derived using:

PBKDF2 or Argon2

The derived key decrypts the vault.

Structure:

Master password
↓
KDF
↓
Encryption key
↓
Vault decrypt
Save password flow

Another Android API:

onSaveRequest()

Triggered when user logs in somewhere.

Flow:

User logs in
↓
Android detects login form
↓
Calls AutofillService
↓
Save prompt shown
↓
User confirms
↓
New cipher stored

Without this your manager cannot capture new passwords.

Handling apps vs websites

Autofill targets two sources.

Websites
https://github.com/login
Apps
com.instagram.android

Bitwarden stores both.

Example:

Cipher URIs

github.com
com.github.android

So the same password works for browser and app.

Accessibility fallback

Some apps block autofill.

Bitwarden adds an optional Accessibility Service.

Flow:

Accessibility service monitors input fields
↓
Detect login form
↓
Show floating vault button

This is a fallback when autofill fails.

Many password managers use this.

Security boundaries

The critical rules Bitwarden follows:

Vault decrypted only in memory

Never store plaintext passwords

AutofillService cannot access vault if locked

All IPC communication encrypted

What this means for your app

Your simplified architecture should look like this:

SecureVault APK

├─ React WebView UI
│
├─ Native Vault Storage
│   └─ SQLCipher encrypted DB
│
├─ Domain Index Engine
│
├─ Android AutofillService
│
├─ SavePasswordService
│
└─ Biometric Unlock Manager
The biggest mistake beginners make

They try to do this:

AutofillService
↓
fetch vault from web app

That breaks security and speed.

The vault must live locally on device.

My blunt recommendation

If autofill is your goal, move vault storage to native Android first.

Your current web-first vault architecture will fight you constantly.

You can keep the UI in React, but the vault should be:

native storage
native crypto
native index

One last reality check.

Autofill is not a weekend feature. In serious password managers it’s one of the largest modules in the codebase.

The upside: once it works, your app jumps from “toy project” to real password manager territory.