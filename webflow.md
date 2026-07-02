# Mellow Art Application Form — Field Reference

Form ID: `wf-form-artist-application` | Method: GET

## Remaining Bug (fix before backend integration)
`sharing` dropdown value is `"Yes"` / `"No"`, but toggle script checks `sharingDropdown.value === 'yes'` (lowercase). Case mismatch → buddy section never triggers. Fix to `'Yes'`.

## Main Applicant
| Field | id | name |
|---|---|---|
| First Name | first-name | first-name |
| Last Name | last-name | last-name |
| Email | email-01 | email-01 |
| Confirm Email | email-02 | email-02 |
| Applied before | first-timer | first-timer |
| Brand Name | brand-name | brand-name |
| Website | website | website |
| Instagram | instagram | instagram |
| Artist Bio | artist-bio | artist-bio |
| Primary Category | category-01 | category-01 |
| Secondary Category | category-02 | category-02 |
| Product Description | product-info | product-info |
| Portfolio Upload (file) | portfolio-file | portfolio-file |

## Stall Options
| Field | id | name |
|---|---|---|
| Stall pref 1 (radio) | mini-debut / standard-debut / flagship-debut / mini / standard / flagship | first-pref |
| Stall pref 2 | second-pref | second-pref |
| Accept mini/shared if full unavailable | half-table-permission | half-table-permission |
| Sharing a stall? (trigger) | sharing | sharing |

## Buddy (only if sharing = "Yes")
| Field | id | name |
|---|---|---|
| First Name | buddy-first-name | buddy-first-name |
| Last Name | buddy-last-name | buddy-last-name |
| Email | buddy-email-01 | buddy-email-01 |
| Confirm Email | buddy-email-02 | buddy-email-02 |
| Applied before | buddy-first-timer | buddy-first-timer |
| Brand Name | buddy-brand-name | buddy-brand-name |
| Website | buddy-website | buddy-website |
| Instagram | buddy-instagram | buddy-instagram |
| Artist Bio | buddy-artist-bio | buddy-artist-bio |
| Primary Category | buddy-category-01 | buddy-category-01 |
| Secondary Category | buddy-category-02 | buddy-category-02 |
| Product Description | buddy-product-info | buddy-product-info |
| Portfolio Upload (file) | buddy-portfolio-file | buddy-portfolio-file |

## Insurance
| Field | id | name |
|---|---|---|
| Insurance status | insurance | insurance |
| Insurance Upload (file) | insurance-file | insurance-file |

## Other
| Field | id | name |
|---|---|---|
| Additional notes | other | other |
