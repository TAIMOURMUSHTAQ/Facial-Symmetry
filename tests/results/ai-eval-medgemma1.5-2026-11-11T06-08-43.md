# AI evaluation: medgemma1.5

Endpoint: http://localhost:11434/v1  
Date: 2026-11-11T06:08:43.440Z  
Cases: 12 synthetic patients (tests/scenarios.js)

Rule engine leading possibility correct: 12/12 (the synthetic cases were written for the engine, so treat this as a sanity check, not a benchmark).

## Mode: blind

| Measure | Score |
|---|---|
| Valid JSON | 9/12 (75%) |
| Leading possibility correct (top-1) | 2/12 (17%) |
| Correct within first 3 (top-3) | 3/12 (25%) |
| Weaker side correct | 9/12 (75%) |
| Emergency handled correctly | 9/12 (75%) |
| Overclaimed a diagnosis | 0/12 |
| Average response time | 41.2 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | (none) | ✗ | ✗ | ✗ (undefined) | ✓ |
| stroke | stroke | Stroke | ✓ | ✓ | ✓ | ✓ |
| normal | normal_variation | Normal facial symmetry | ✓ | ✓ | ✓ | ✓ |
| myasthenia | myasthenia | Ptosis | ✗ | ✗ | ✓ | ✓ |
| cn3 | cn3 | (none) | ✗ | ✗ | ✗ (undefined) | ✗ |
| ramsay_hunt | ramsay_hunt | Bell's palsy | ✗ | ✗ | ✓ | ✓ |
| cn12 | cn12 | Facial nerve palsy (right) | ✗ | ✓ | ✓ | ✓ |
| cn5 | cn5_motor | Facial nerve palsy | ✗ | ✗ | ✓ | ✓ |
| hemifacial_spasm | hemifacial_spasm | (none) | ✗ | ✗ | ✗ (undefined) | ✓ |
| gbs | gbs | Bell's palsy | ✗ | ✗ | ✓ | ✗ |
| horner | horner | Ptosis | ✗ | ✗ | ✓ | ✗ |
| parkinsonism | parkinsonism | Facial nerve palsy | ✗ | ✗ | ✓ | ✓ |

## Mode: assist

| Measure | Score |
|---|---|
| Valid JSON | 7/12 (58%) |
| Leading possibility correct (top-1) | 7/12 (58%) |
| Correct within first 3 (top-3) | 7/12 (58%) |
| Weaker side correct | 7/12 (58%) |
| Emergency handled correctly | 9/12 (75%) |
| Overclaimed a diagnosis | 0/12 |
| Average response time | 59.6 s |

| Case | Expected | Model's leading possibility | Top-1 | Top-3 | Side | Emergency |
|---|---|---|---|---|---|---|
| bells | bells | (none) | ✗ | ✗ | ✗ (undefined) | ✓ |
| stroke | stroke | (none) | ✗ | ✗ | ✗ (undefined) | ✗ |
| normal | normal_variation | Normal facial asymmetry | ✓ | ✓ | ✓ | ✓ |
| myasthenia | myasthenia | (none) | ✗ | ✗ | ✗ (undefined) | ✓ |
| cn3 | cn3 | (none) | ✗ | ✗ | ✗ (undefined) | ✗ |
| ramsay_hunt | ramsay_hunt | Ramsay Hunt syndrome (herpes zoster oticus) | ✓ | ✓ | ✓ | ✗ |
| cn12 | cn12 | Hypoglossal nerve (CN XII) weakness | ✓ | ✓ | ✓ | ✓ |
| cn5 | cn5_motor | Trigeminal motor weakness (CN V3) | ✓ | ✓ | ✓ | ✓ |
| hemifacial_spasm | hemifacial_spasm | Hemifacial spasm | ✓ | ✓ | ✓ | ✓ |
| gbs | gbs | Guillain-Barré syndrome | ✓ | ✓ | ✓ | ✓ |
| horner | horner | Horner syndrome | ✓ | ✓ | ✓ | ✓ |
| parkinsonism | parkinsonism | (none) | ✗ | ✗ | ✗ (undefined) | ✓ |
