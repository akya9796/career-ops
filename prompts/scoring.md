# Scoring Prompt

Compare the job description with `cv.md`.

Rules:

- Use only facts from `cv.md`.
- Return a 0-100 score.
- Return `Apply`, `Maybe`, or `Skip`.
- List matched CV facts.
- List job requirements not found in the CV.
- Do not infer experience, authorization, certifications, degrees, employers, or achievements.

