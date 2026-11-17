# AI evaluation: medgemma1.5

Endpoint: http://localhost:11434/v1  
Date: 2026-11-17T16:11:21.161Z  
Cases: 1 synthetic patients (tests/scenarios.js)

The AI receives what a therapist would enter: their own capture names, neutral measurements, free-text notes and safety ticks. No rule engine.

## Mode: therapist-led

| Measure | Score |
|---|---|
| Valid JSON | 1/1 (100%) |
| Leading possibility correct (top-1) | 1/1 (100%) |
| Correct within first 3 (top-3) | 1/1 (100%) |
| Weaker side correct | 1/1 (100%) |
| Emergency handled correctly | 1/1 (100%) |
| Overclaimed a diagnosis | 0/1 |
| Average response time | 38.9 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| stroke | /stroke/central/upper motor/cerebrovascu | Stroke | ✓ | ✓ | ✓ | ✓ |
