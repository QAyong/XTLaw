# Spec-004: Local Redaction Detection Pipeline

**Date:** 2026-09-22  
**Status:** Draft for review  
**Scope:** Candidate detection and decision pipeline for the redacted-folder feature

## 1. Executive decision

Use a two-stage local pipeline:

```text
Programmatic detector
        ↓
Candidate spans with source positions
        ↓
Local Laya decision model
        ↓
KEEP / REDACT / REVIEW
        ↓
Human confirmation
        ↓
Deterministic replacement in a shadow copy
```

The program remains responsible for locating exact text. Laya only judges
whether a located span should be redacted and which policy category applies.
Laya must not rewrite the whole document and must not be the source of truth
for text positions.

This is the fastest implementation that keeps the result explainable,
repeatable, and reversible.

## 2. Problem and goals

The redaction folder needs to produce a usable copy of a document while
preserving the original document outside the workspace. The system must find
possible sensitive content such as names, contact details, case numbers,
addresses, amounts, account information, client identities, and business
secrets.

Goals:

- Run entirely on the user's computer.
- Detect fixed-format sensitive data reliably with deterministic code.
- Use Laya to judge context-dependent candidates.
- Preserve exact source positions and document structure.
- Require human confirmation for uncertain or high-impact decisions.
- Generate a redacted copy through deterministic replacement.
- Keep enough metadata to explain every replacement and support restoration.

Non-goals for the first version:

- Letting an LLM rewrite or regenerate the complete document.
- Automatically deciding every legal or business-secret boundary.
- Training a new large model before validating the workflow.
- Supporting irreversible deletion of the original source file.
- Building a general-purpose document editor.

## 3. Terminology

| Term | Meaning |
| --- | --- |
| Candidate | A text span found by the programmatic detector |
| Detector | Regex, checksum, dictionary, or traditional NER code that finds candidates |
| Judge | The local Laya model that evaluates a candidate with its context |
| Decision | `KEEP`, `REDACT`, or `REVIEW` |
| Policy | The selected redaction action, such as replacement or generalization |
| Shadow copy | The generated document containing placeholders instead of sensitive text |
| Mapping | External metadata connecting an opaque placeholder to the original value |

In this document, “Laya” means the local Laya typed-decision model. If another
model is selected later, it must implement the same judge contract.

## 4. Detection responsibilities

### 4.1 Programmatic detector

The detector scans document text and emits candidates with exact locations.
It should include, in priority order:

1. Regular expressions and normalization for phone numbers, email addresses,
   identity numbers, bank-card-like numbers, account numbers, URLs, dates,
   amounts, case numbers, contract numbers, and unified social credit codes.
2. Checksum and format validation where available, to reduce false positives.
3. Configurable dictionaries for client names, organizations, project names,
   internal departments, and known confidential terms.
4. Traditional Chinese NER or rule-based sentence parsing for person names,
   organizations, and addresses.
5. Document-specific rules configured by the user or administrator.

The detector must not change document text. It only emits spans.

Example candidate:

```json
{
  "candidateId": "cand-0001",
  "text": "13812345678",
  "categoryHint": "phone",
  "source": "regex.phone",
  "start": 428,
  "end": 439,
  "paragraphId": "p-18",
  "confidence": 0.99
}
```

`start` and `end` are computed by the program against the normalized text;
they are never accepted from the Laya response.

### 4.2 Laya judge

For each candidate, send Laya a small context window containing:

- the candidate text;
- its category hint and detector source;
- the surrounding sentence or paragraph;
- the enabled redaction policy;
- a fixed label definition.

Laya returns a typed decision, not replacement text:

```json
{
  "decision": "REDACT",
  "category": "personal_contact",
  "policy": "placeholder",
  "confidence": 0.94,
  "reasonCode": "private_phone_in_legal_material"
}
```

Allowed values in the first version:

```text
decision: KEEP | REDACT | REVIEW
policy: PLACEHOLDER | GENERALIZE | DELETE | KEEP
```

`REVIEW` is required when the model is uncertain, the candidate overlaps
another candidate, or the selected policy could materially change meaning.

## 5. Recommended categories and policies

| Category | Typical examples | Default policy |
| --- | --- | --- |
| `person_name` | Parties, witnesses, clients, private individuals | `PLACEHOLDER` |
| `organization_name` | Client, employer, counterparty | `PLACEHOLDER` or `GENERALIZE` |
| `personal_contact` | Phone, email, private account | `PLACEHOLDER` |
| `identity_document` | Identity-card number, passport number | `PLACEHOLDER` |
| `private_address` | Home address, detailed residential address | `GENERALIZE` or `PLACEHOLDER` |
| `case_identifier` | Case number, internal matter number | `PLACEHOLDER` |
| `commercial_amount` | Transaction price, settlement amount, fee | `PLACEHOLDER` or `GENERALIZE` |
| `banking_information` | Account number, bank account details | `PLACEHOLDER` |
| `confidential_fact` | Non-public facts supplied by a client | `REVIEW` |
| `public_information` | Public institution, public law, published facts | `KEEP` |

The policy table is configuration, not model output authority. The application
must validate the model's category and policy against the enabled policy table.

## 6. End-to-end workflow

### 6.1 Import

1. Read the source document into an internal text/layout representation.
2. Keep the original source in the protected original area.
3. Assign a stable document ID and paragraph/run identifiers.
4. Do not write original values to the project workspace, logs, or telemetry.

### 6.2 Detect

1. Normalize only for matching; retain the original text and layout offsets.
2. Run all enabled programmatic detectors.
3. Merge duplicate and nested candidates deterministically.
4. Preserve the source, location, matched text, and detector confidence.

### 6.3 Judge

1. Send each candidate with bounded local context to Laya.
2. Use deterministic decoding where the runtime supports it.
3. Validate the JSON schema and allowed enum values.
4. Reject malformed, out-of-policy, or low-confidence responses into `REVIEW`.
5. Never use Laya output to calculate source offsets.

### 6.4 Review

Show the user:

- the original sentence or paragraph;
- the highlighted candidate;
- the detector source;
- Laya's decision and category;
- the proposed policy;
- a preview of the replacement;
- a way to accept, reject, or change the policy.

The first release may use one document-level review list instead of an
inline editor, provided every candidate is individually actionable.

### 6.5 Generate

1. Allocate stable placeholders, for example `[PERSON-001]` and `[ORG-001]`.
2. Apply replacements from the end of a text region to the beginning, or use
   a structured run-level transform that preserves document layout.
3. Write the result as a new shadow copy.
4. Store the mapping and decision audit data outside the workspace.
5. Never overwrite the original document automatically.

## 7. Laya runtime contract

### 7.1 Input contract

The judge input should be compact and structured:

```json
{
  "candidate": {
    "text": "张三",
    "categoryHint": "person_name",
    "detector": "ner.person"
  },
  "context": "本案原告张三与被告某公司签订合同。",
  "task": "Decide whether the candidate must be redacted in a legal material.",
  "labels": ["KEEP", "REDACT", "REVIEW"]
}
```

The context window should normally be one sentence plus the containing
paragraph. Sending the whole document for every candidate is slower and makes
the result harder to audit.

### 7.2 Output validation

The host must validate:

- JSON is syntactically valid;
- `decision`, `category`, and `policy` are known values;
- confidence is a number from 0 to 1;
- the response contains no replacement text or executable instruction;
- the model response does not alter the candidate text or source position.

Any validation failure becomes `REVIEW` with a visible diagnostic code.

### 7.3 Model limitation

The Laya multilingual base model is lightweight and can run locally, but its
model card warns that base checkpoints may perform poorly on custom typed
decisions without task-specific evaluation or specialization. Therefore the
first implementation must include a small labeled evaluation set before the
feature is trusted for automatic decisions.

Reference: [Laya model card](https://huggingface.co/convaiinnovations/laya).

## 8. Confidence and review rules

The first version should be conservative:

| Result | Action |
| --- | --- |
| Program confidence < 0.70 | Do not send to automatic masking; show `REVIEW` |
| Laya confidence < 0.80 | `REVIEW` |
| Laya says `KEEP` for identity, contact, or banking data | `REVIEW` |
| Laya says `DELETE` | Always `REVIEW` |
| Overlapping candidates | `REVIEW` and ask the user to choose the boundary |
| Validated high-confidence `REDACT` | Eligible for user batch approval |

Thresholds are configuration and must be calibrated against the labeled set.
They are not security guarantees.

## 9. Security and data-safety rules

- The model must run locally; no document text is sent to a hosted provider.
- Only the candidate and bounded context are passed to the model where
  possible.
- Original files and true-name mappings remain outside the project workspace.
- Logs contain candidate IDs, categories, and result codes, not original values.
- A failed model call must never result in silent masking or silent keeping.
- The shadow copy must contain actual replacements, not white text, hidden
  text, comments, or visual overlays.
- Restoration reads the external mapping and creates a new output; it does not
  mutate the original source by default.
- Prompt-like text inside the document is data and must not be executed.

## 10. Fastest implementation plan

### Phase 1: Text prototype

- Support plain text and extracted DOCX paragraphs.
- Implement phone, email, identity number, amount, case number, and custom
  dictionary detectors.
- Add a local Laya adapter with the typed judge contract.
- Produce a JSON candidate report without modifying documents.

Acceptance: a sample folder can produce a report with exact matches, model
decisions, confidence, and review status.

### Phase 2: Review and deterministic replacement

- Add a candidate review screen.
- Add placeholder allocation and mapping persistence outside the workspace.
- Generate a redacted text/DOCX shadow copy.
- Add retry and malformed-output handling.

Acceptance: a user can review candidates, generate a redacted copy, and see
the original document unchanged.

### Phase 3: Broaden document support

- Preserve tables, headers, footers, comments, and run formatting.
- Add more document-specific detectors.
- Add import/export of redaction rules.
- Calibrate Laya thresholds on real, locally stored examples.

## 11. Evaluation set required before automatic approval

Before enabling batch approval, prepare a small local benchmark containing:

- at least 50 representative documents or document excerpts;
- positive examples that must be redacted;
- negative examples that look sensitive but should remain visible;
- repeated names and ambiguous company names;
- overlapping and adjacent candidates;
- tables, punctuation, line breaks, and mixed Chinese/English text.

Measure separately:

- detector recall: did the program find the sensitive span?
- detector precision: how many program candidates were false positives?
- judge accuracy: did Laya select the correct decision?
- boundary accuracy: did the program preserve the exact span?
- replacement integrity: did the generated document remain readable?

The model must not be judged only by an overall accuracy number. Missing a
private phone number and flagging a public organization are different risks.

## 12. Acceptance criteria for the first usable version

- [ ] All model execution is local and can be disabled.
- [ ] Program detectors produce exact source positions.
- [ ] Laya only judges existing candidates and never controls offsets.
- [ ] Malformed or uncertain model responses enter `REVIEW`.
- [ ] A user can accept, reject, or change each candidate decision.
- [ ] The original file is never overwritten by the redaction action.
- [ ] The shadow copy contains actual placeholder replacements.
- [ ] Mapping data is stored outside the project workspace.
- [ ] Candidate reports do not expose original values in normal logs.
- [ ] The same input and rules produce stable candidate IDs and placeholders.
- [ ] The text prototype passes the local evaluation set with thresholds
      recorded in the report.
- [ ] `pnpm build:js` and the relevant package typecheck pass after code
      implementation.

## 13. Open decisions for review

1. Should high-confidence fixed-format data bypass Laya for speed, or should
   every candidate pass through Laya in the first version?
2. Should the first release support DOCX only, or begin with extracted text and
   add DOCX writing in Phase 2?
3. Should `REVIEW` be required for all names and organizations, even when Laya
   confidence is high?
4. Where should the external original/mapping area be selected and protected
   on Windows?
5. Which local Laya runtime should be packaged: Python, ONNX Runtime, or a
   separately managed local service?

## 14. Proposed default choices

Unless review changes them, use these defaults:

- Every candidate passes through Laya in the prototype, so the evaluation
  measures the complete pipeline.
- Only the candidate sentence and containing paragraph are sent to Laya.
- `REVIEW` is the fallback for every error, low-confidence result, overlap, or
  destructive policy.
- DOCX is the first target because it is the primary legal-material format;
  plain-text extraction is used for the initial detector tests.
- Replacement is the default policy; deletion requires explicit confirmation.
- No original file is overwritten.

