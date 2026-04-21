You are a senior security engineer and full-stack architect specializing in secure cloud applications (Firebase, GCP, cryptography, zero-trust systems).

Your task is to generate a **production-grade implementation plan** for Phase 1 of a secure application called **SecureVault**.

---

## 🎯 OBJECTIVE

Design and implement the **foundational security layer** of the system with zero-trust principles.

The system must be secure against:

* Unauthorized access
* Credential theft
* Replay attacks
* API abuse / bot traffic
* Data leaks (at rest + in transit)
* Insider misuse via backend misconfiguration

---

## 🧱 PHASE 1 COMPONENTS (STRICT ORDER)

1. Cloud Functions (Backend control layer)
2. App Check (Client authenticity enforcement)
3. Authentication System
4. Encryption System (client + server strategy)
5. Password Storage Logic

---

## ⚙️ REQUIRED OUTPUT STRUCTURE

Provide output in the following exact format:

### 1. SYSTEM ARCHITECTURE

* High-level architecture diagram (text-based)
* Data flow (client → backend → storage)
* Trust boundaries (explicitly define)

---

### 2. COMPONENT-BY-COMPONENT IMPLEMENTATION

For EACH component:

#### A. Purpose

* Why this exists (security perspective)

#### B. Implementation Steps

* Step-by-step setup (code-level where needed)
* Firebase / GCP configuration
* Required SDKs / libraries

#### C. Security Design Decisions

* Why specific approach is chosen over alternatives

#### D. Code Snippets

* Minimal but production-grade examples

#### E. Failure Cases

* What breaks if misconfigured

---

### 3. SECURITY MODEL

Define explicitly:

* Authentication vs Authorization vs App Verification
* How Firebase Auth + App Check work together ([Firebase][1])
* Why Cloud Functions bypass security rules and must enforce access manually ([Stack Overflow][2])
* Principle of least privilege implementation
* Token validation flow (Auth token + App Check token)

---

### 4. ENCRYPTION STRATEGY

* Data in transit (TLS assumptions)
* Data at rest (Firebase default vs custom encryption)
* Client-side encryption (when and why)
* Key management strategy (VERY IMPORTANT)
* Threat: attacker gains DB access → what do they see?

---

### 5. PASSWORD STORAGE DESIGN

* Hashing algorithm (Argon2 / bcrypt comparison)
* Salt strategy
* Why NOT to use encryption for passwords
* Brute-force protection strategy
* Rate limiting

---

### 6. CLOUD FUNCTIONS SECURITY HARDENING

* Input validation
* Auth context validation (`context.auth`)
* App Check token verification
* Rate limiting / abuse protection
* Prevent infinite loops / self-DOS ([Firebase][3])

---

### 7. REAL-WORLD ATTACK SCENARIOS

Explain how system handles:

* Attacker calling APIs without app
* Stolen JWT token reuse
* Reverse-engineered APK/web app
* Insider modifying Firebase rules
* Bot flooding endpoints

---

### 8. COMMON DEVELOPER MISTAKES (CALL THEM OUT)

Explicitly list:

* What junior devs usually do wrong
* What leads to silent security failure
* What looks secure but is not

---

### 9. FINAL CHECKLIST

* Deployment checklist
* Security audit checklist
* Logging + monitoring requirements

---

## 🚫 CONSTRAINTS

* Do NOT give generic advice
* Do NOT skip implementation details
* Do NOT assume trust in client
* Treat backend as hostile-exposed surface
* Every decision must be justified from a security standpoint

---

## 🧠 THINKING MODE

Act like:

* You are defending against a motivated attacker
* The developer is likely to misconfigure things
* The system will scale and be targeted

---

## OUTPUT QUALITY

* Concise but deep
* No fluff
* Implementation-ready
* Security-first thinking ONLY

---

[1]: https://firebase.google.com/docs/app-check?utm_source=chatgpt.com "Firebase App Check - Google"
[2]: https://stackoverflow.com/questions/69393989/how-to-use-firebase-security-rules-to-secure-cloud-functions-calls-with-firebase?utm_source=chatgpt.com "How to use Firebase Security Rules to secure Cloud ..."
[3]: https://firebase.google.com/support/guides/security-checklist?utm_source=chatgpt.com "Firebase security checklist"
