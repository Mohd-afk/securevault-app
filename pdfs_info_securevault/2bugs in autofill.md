Building a password manager and you actually want the ugly edge cases up front. That’s refreshing. Most people discover these after shipping and then spend months apologizing to users. Here are three nasty autofill problems that regularly break even well-funded managers. If you design around them now, you’ll save yourself a pile of grief later.

1. Multi-step login flows (email page → password page)

Many major sites do this now.

Example flow:

Step 1
Enter email
↓
Step 2
Enter password

Examples:

Google
Amazon
Microsoft
Apple

The autofill request often happens twice, and the password field appears on a completely different screen.

What goes wrong

Basic autofill logic assumes both fields exist at once.

Typical broken behavior:

User enters email
↓
Next page appears
↓
Password manager doesn't match anymore

Your service receives a new AssistStructure with only a password field and no username context.

What good managers do

They keep a temporary session cache.

Example logic:

user enters username
↓
manager remembers username + domain
↓
password page appears
↓
manager uses cached username match

Pseudo-logic:

recentLoginContext[domain] = username

When password page loads:

if only password field present
use cached username context
Implementation suggestion

Create a short-lived memory cache:

Map<domain, username>
TTL = 60 seconds

Clear it after fill.

Otherwise autofill fails on half the internet.

2. Android apps that hide login fields

Some apps intentionally avoid normal input fields.

Examples:

Instagram
Snapchat
Uber
some banking apps

Instead of standard fields they use:

custom views
obfuscated input classes

Android AutofillService relies on hints like:

autofillHints
inputType
viewId

These apps remove them.

What goes wrong

Your parser sees:

unknown view
unknown type

So autofill never triggers.

What big managers do

They fall back to heuristics.

Typical checks:

viewId contains:
username
login
email

hint text contains:
password
pass
pin

Example detection logic:

if view.hint.contains("email")

or

if view.id.contains("password")

Also check:

inputType = TYPE_TEXT_VARIATION_PASSWORD
Real solution

Your AutofillHelper must support three detection layers:

1. official autofillHints
2. inputType
3. heuristic matching

Otherwise many apps will never autofill.

3. Same domain, different accounts

Users often store multiple accounts for the same site.

Example:

amazon.com
john@gmail.com
jane@gmail.com
work@company.com

Your autofill must handle multiple matches.

What goes wrong

Weak implementations do:

fill first match

User logs into the wrong account.

Or worse:

wrong password filled
account lock
Correct behavior

Show a picker list.

Example:

SecureVault

john@gmail.com
jane@gmail.com
work@company.com

Android supports this via multiple Dataset entries.

Example:

datasets.add(dataset1)
datasets.add(dataset2)
datasets.add(dataset3)
Improve UX with ranking

Sort results by:

lastUsed
exactDomainMatch
recentLogin

Example priority:

exact domain > subdomain > base domain

So:

login.amazon.com

prefers entries saved for:

amazon.com
Bonus edge case (this one surprises people)
4. Mobile web vs app mismatch

Example:

User saves credential for:

amazon.com

But Android app reports:

com.amazon.mShop.android.shopping

Your vault entry doesn't match.

Fix

Maintain a package → domain mapping table.

Example:

com.netflix.mediaclient → netflix.com
com.twitter.android → twitter.com
com.amazon.mShop.android.shopping → amazon.com

Start with a small list of top apps.

Later add user learning:

user fills manually
↓
store package-domain mapping
Another subtle one
5. Login forms inside WebViews

Many apps load login pages inside an internal WebView.

Example:

Spotify
Discord
some banking apps

Android sometimes reports:

no domain

Only:

view hierarchy
Workaround

Extract domain from:

WebView URL

If available in AssistStructure.

Fallback:

app package mapping
Security trap many managers fall into

Never autofill automatically.

Always require user tap.

Meaning:

tap field
↓
SecureVault suggestion
↓
user taps credential
↓
fill happens

Never:

auto fill immediately

Automatic filling can leak passwords into malicious forms.

Three defensive checks you should implement

Before filling credentials verify:

1. field type = password
2. domain match confidence > threshold
3. user interaction occurred

This prevents phishing attempts inside apps.

The real reason autofill is difficult

Most developers assume login forms are:

email
password
submit

Reality is chaos:

hidden fields
split flows
custom inputs
WebViews
obfuscated views

So your autofill logic must be adaptive, not rigid.

Final advice

When you implement this system, add diagnostic logging in debug builds:

detected domain
fields detected
matching entries
fill result

Without this, debugging autofill is painful.

You’re building one of the hardest components of a password manager, but your plan is already more structured than most early implementations. The key is anticipating weird login flows before users hit them.

