# Eval report — 2026-11-23T08:38:50.351Z

- **Prompts:** v2 (2026-11-23.2), v3 (2026-11-23.3)
- **Models:** claude-sonnet-5-5, claude-haiku-5-5
- **Repeats:** 3 · **Rooms:** bedroom-1
- **Runs:** 24 planned · 24 ok · 0 unusable · 0 failed · 0 skipped (cost cap)
- **Cost:** $0.3462 actual (estimated $0.3969; cap $1.00)

Area = total floor area the app would compute (main room + closets − built-ins, after the merge locks any known wall). Error = (likely − truth) / truth. Coverage = truth inside the low–high range. Spread = likely area across identical repeats.

## Rooms and ground truth

| Room | Total area | Main (L × W) | Closets | Notes |
|---|---|---|---|---|
| bedroom-1 | 112.5 sq ft | unknown | unknown | User-measured, approximate: 12.47 × 9.02 ft. The 12.47 ft length INCLUDES the reach-in closet; the 9.02 ft width does not. Main-room-only dimensions and closet size are unknown, so only total area is scored. |

## Skipped conditions

| Room | Condition | Reason |
|---|---|---|
| bedroom-1 | known-longest | The 12.47 ft length includes the closet, but a known measurement must be the main room only (wall to wall, excluding closets). Re-measure without the closet to enable this condition. |

## Summary by prompt × model (all rooms and conditions pooled)

| Prompt | Model | OK | Mean error | Mean \|error\| | Coverage | Range width | Cost/run | Time/run | Notes flagged |
|---|---|---|---|---|---|---|---|---|---|
| v2 | claude-sonnet-5-5 | 6/6 | +8.1% | 8.3% | 100% | 44% | $0.0251 | 9.7s | 5 of 18 |
| v2 | claude-haiku-5-5 | 6/6 | +12.8% | 13.0% | 83% | 41% | $0.0022 | 13.5s | 3 of 18 |
| v3 | claude-sonnet-5-5 | 6/6 | +8.0% | 8.0% | 100% | 43% | $0.0284 | 10.0s | 0 of 18 |
| v3 | claude-haiku-5-5 | 6/6 | +17.7% | 17.7% | 100% | 45% | $0.0020 | 12.5s | 0 of 17 |

## Results by group (room × condition × prompt × model)

| Room | Condition | Prompt | Model | OK | Mean error | Mean \|error\| | Likely area min–max | Spread (SD) | Coverage | Range width | Closet | Cost/run | Time/run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bedroom-1 | none | v2 | claude-sonnet-5-5 | 3/3 | +14.1% | 14.1% | 127.0–131.0 | 2.3 sq ft | 100% | 57% | 11.7 sq ft | $0.0277 | 11.0s |
| bedroom-1 | none | v2 | claude-haiku-5-5 | 3/3 | +24.4% | 24.4% | 138.0–142.0 | 2.0 sq ft | 67% | 54% | 10.0 sq ft | $0.0022 | 13.8s |
| bedroom-1 | none | v3 | claude-sonnet-5-5 | 3/3 | +13.8% | 13.8% | 122.0–132.0 | 5.3 sq ft | 100% | 54% | 11.3 sq ft | $0.0271 | 9.0s |
| bedroom-1 | none | v3 | claude-haiku-5-5 | 3/3 | +28.4% | 28.4% | 136.0–149.5 | 7.4 sq ft | 100% | 58% | 14.7 sq ft | $0.0022 | 13.5s |
| bedroom-1 | known-shortest | v2 | claude-sonnet-5-5 | 3/3 | +2.1% | 2.6% | 111.7–116.4 | 2.7 sq ft | 100% | 31% | 9.3 sq ft | $0.0224 | 8.4s |
| bedroom-1 | known-shortest | v2 | claude-haiku-5-5 | 3/3 | +1.1% | 1.5% | 111.7–115.7 | 2.0 sq ft | 100% | 29% | 10.0 sq ft | $0.0021 | 13.1s |
| bedroom-1 | known-shortest | v3 | claude-sonnet-5-5 | 3/3 | +2.2% | 2.2% | 113.7–116.5 | 1.4 sq ft | 100% | 32% | 10.7 sq ft | $0.0297 | 11.0s |
| bedroom-1 | known-shortest | v3 | claude-haiku-5-5 | 3/3 | +6.9% | 6.9% | 115.7–124.8 | 4.5 sq ft | 100% | 31% | 12.0 sq ft | $0.0019 | 11.4s |

## Repeatability

Across 8 groups with ≥ 2 successful repeats: likely-area SD averages 3.5 sq ft (max 7.4); min–max spread averages 6.5 sq ft (max 13.5). A difference between configurations smaller than this is indistinguishable from run-to-run noise.

## Notes rule checks (heuristic; read the flagged notes)

| Run | Prompt | Model | Rule | Note |
|---|---|---|---|---|
| 5 | v2 | claude-sonnet-5-5 | first person | I treated the second white door in photo 2 as a closet or bathroom door and did not add its floor. |
| 5 | v2 | claude-sonnet-5-5 | unsupported action | The mirrored sliding door on the left looks like a closet; its size is assumed and not shown, so measure it if you can. |
| 9 | v2 | claude-sonnet-5-5 | first person | I treated the door on the left in Photo 2 as a possible closet or bathroom and left it out; the other door is assumed to be the room entry. |
| 13 | v2 | claude-sonnet-5-5 | unsupported action | The other door in photo 2 may be a bathroom or second closet and is not counted; add it if flooring goes there. |
| 14 | v2 | claude-haiku-5-5 | first person | I assumed the 9.02 ft measurement is the width of the room, the side across from the bed's headboard wall. |
| 18 | v2 | claude-haiku-5-5 | first person | I assumed a queen bed and 8 ft ceilings as scale references; if the bed is a full size, the room may be slightly smaller. |
| 18 | v2 | claude-haiku-5-5 | first person | I did not count the white hinged door in the alcove beside the black bag as a closet; if it opens to a closet, that closet needs to be added. |
| 18 | v2 | claude-haiku-5-5 | unsupported action | I did not count the white hinged door in the alcove beside the black bag as a closet; if it opens to a closet, that closet needs to be added. |
| 21 | v2 | claude-sonnet-5-5 | unsupported action | A photo from the doorway showing the full floor length with a tape measure or door in view would narrow the range. |

## All runs

| # | Rep | Room | Condition | Prompt | Model | Status | Area likely (low–high) | Error | In range | Width | Main L × W (likely) | Closet | Conf. | Issues | Tokens in/out | Cost | Time | Att. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | bedroom-1 | none | v2 | claude-sonnet-5-5 | ok | 127.0 (101.7–160.5) | +12.9% | yes | 46% | 11.50 × 10.00 | 12.0 | medium | — | 8213/1107 | $0.0275 | 11.8s | 1 |
| 2 | 1 | bedroom-1 | none | v2 | claude-haiku-5-5 | ok | 140.0 (104.3–177.0) | +24.4% | yes | 52% | 12.00 × 11.00 | 8.0 | low | other | 8213/2729 | $0.0022 | 13.7s | 1 |
| 3 | 1 | bedroom-1 | none | v3 | claude-sonnet-5-5 | ok | 132.0 (101.7–175.3) | +17.3% | yes | 56% | 12.00 × 10.00 | 12.0 | medium | — | 8361/1069 | $0.0274 | 9.2s | 1 |
| 4 | 1 | bedroom-1 | none | v3 | claude-haiku-5-5 | ok | 149.5 (112.0–192.5) | +32.9% | yes | 54% | 12.50 × 11.00 | 12.0 | medium | other | 8361/2361 | $0.0020 | 12.2s | 1 |
| 5 | 1 | bedroom-1 | known-shortest | v2 | claude-sonnet-5-5 | ok | 111.7 (100.1–134.1) | -0.7% | yes | 30% | 11.50 × 9.02* | 8.0 | low | — | 8264/588 | $0.0224 | 10.8s | 1 |
| 6 | 1 | bedroom-1 | known-shortest | v2 | claude-haiku-5-5 | ok | 115.7 (96.9–134.8) | +2.9% | yes | 33% | 11.50 × 9.02* | 12.0 | medium | other, other | 8264/2371 | $0.0020 | 12.6s | 1 |
| 7 | 1 | bedroom-1 | known-shortest | v3 | claude-sonnet-5-5 | ok | 116.5 (100.1–137.3) | +3.6% | yes | 32% | 11.70 × 9.02* | 11.0 | medium | — | 8412/1288 | $0.0297 | 11.3s | 1 |
| 8 | 1 | bedroom-1 | known-shortest | v3 | claude-haiku-5-5 | ok | 120.2 (100.7–141.8) | +6.9% | yes | 34% | 12.00 × 9.02* | 12.0 | medium | other | 8412/2314 | $0.0020 | 12.1s | 1 |
| 9 | 2 | bedroom-1 | none | v2 | claude-sonnet-5-5 | ok | 127.0 (92.2–169.5) | +12.9% | yes | 61% | 11.50 × 10.00 | 12.0 | low | — | 8213/1104 | $0.0275 | 11.0s | 1 |
| 10 | 2 | bedroom-1 | none | v2 | claude-haiku-5-5 | ok | 138.0 (105.0–188.0) | +22.7% | yes | 60% | 12.00 × 10.50 | 12.0 | low | other, other | 8213/2639 | $0.0021 | 13.4s | 1 |
| 11 | 2 | bedroom-1 | none | v3 | claude-sonnet-5-5 | ok | 130.0 (100.8–176.3) | +15.6% | yes | 58% | 12.00 × 10.00 | 10.0 | medium | — | 8361/1107 | $0.0278 | 9.5s | 1 |
| 12 | 2 | bedroom-1 | none | v3 | claude-haiku-5-5 | ok | 136.0 (99.0–180.3) | +20.9% | yes | 60% | 12.00 × 10.00 | 16.0 | medium | other | 8361/2848 | $0.0023 | 14.6s | 1 |
| 13 | 2 | bedroom-1 | known-shortest | v2 | claude-sonnet-5-5 | ok | 116.4 (101.0–138.0) | +3.5% | yes | 32% | 11.80 × 9.02* | 10.0 | medium | — | 8264/624 | $0.0228 | 8.1s | 1 |
| 14 | 2 | bedroom-1 | known-shortest | v2 | claude-haiku-5-5 | ok | 113.7 (100.7–129.0) | +1.1% | yes | 25% | 11.50 × 9.02* | 10.0 | medium | other | 8264/2616 | $0.0021 | 13.7s | 1 |
| 15 | 2 | bedroom-1 | known-shortest | v3 | claude-sonnet-5-5 | ok | 113.7 (98.3–133.5) | +1.1% | yes | 31% | 11.50 × 9.02* | 10.0 | medium | — | 8412/1242 | $0.0292 | 10.3s | 1 |
| 16 | 2 | bedroom-1 | known-shortest | v3 | claude-haiku-5-5 | ok | 115.7 (99.2–132.7) | +2.9% | yes | 29% | 11.50 × 9.02* | 12.0 | medium | other | 8412/2285 | $0.0020 | 11.7s | 1 |
| 17 | 3 | bedroom-1 | none | v2 | claude-sonnet-5-5 | ok | 131.0 (96.5–179.2) | +16.4% | yes | 63% | 12.00 × 10.00 | 11.0 | low | — | 8213/1161 | $0.0280 | 10.3s | 1 |
| 18 | 3 | bedroom-1 | none | v2 | claude-haiku-5-5 | ok | 142.0 (116.0–185.0) | +26.2% | **no** | 49% | 12.00 × 11.00 | 10.0 | low | other | 8213/3039 | $0.0023 | 14.4s | 1 |
| 19 | 3 | bedroom-1 | none | v3 | claude-sonnet-5-5 | ok | 122.0 (97.2–157.5) | +8.4% | yes | 49% | 11.00 × 10.00 | 12.0 | medium | — | 8361/952 | $0.0262 | 8.2s | 1 |
| 20 | 3 | bedroom-1 | none | v3 | claude-haiku-5-5 | ok | 148.0 (108.8–198.8) | +31.6% | yes | 61% | 12.00 × 11.00 | 16.0 | medium | other | 8361/2697 | $0.0022 | 13.8s | 1 |
| 21 | 3 | bedroom-1 | known-shortest | v2 | claude-sonnet-5-5 | ok | 116.4 (101.0–138.0) | +3.5% | yes | 32% | 11.80 × 9.02* | 10.0 | medium | — | 8264/560 | $0.0221 | 6.3s | 1 |
| 22 | 3 | bedroom-1 | known-shortest | v2 | claude-haiku-5-5 | ok | 111.7 (99.2–132.3) | -0.7% | yes | 30% | 11.50 × 9.02* | 8.0 | medium | other, other | 8264/2566 | $0.0021 | 13.1s | 1 |
| 23 | 3 | bedroom-1 | known-shortest | v3 | claude-sonnet-5-5 | ok | 114.7 (97.4–134.8) | +2.0% | yes | 33% | 11.50 × 9.02* | 11.0 | medium | — | 8412/1347 | $0.0303 | 11.4s | 1 |
| 24 | 3 | bedroom-1 | known-shortest | v3 | claude-haiku-5-5 | ok | 124.8 (107.3–145.0) | +10.9% | yes | 30% | 12.50 × 9.02* | 12.0 | medium | other | 8412/2020 | $0.0019 | 10.5s | 1 |

`*` = measured (locked by the merge).

## Notes by run

- **#1** v2 / claude-sonnet-5-5 / none:
  - The mirrored sliding doors are assumed to be a reach-in closet about 2 ft deep; its width is a guess.
  - A tape measurement of one wall would tighten this estimate a lot.
  - A photo from the doorway showing the whole floor, plus the other closet or door areas, would help.
- **#2** v2 / claude-haiku-5-5 / none:
  - The mirrored sliding door was treated as the closet. The white hinged door in the middle of Photo 2 was left out because its contents are unclear.
  - Measuring one wall from corner to corner and entering it would tighten this estimate a lot.
  - A photo of the floor with the furniture moved aside would show more of the carpet and make the estimate more reliable.
- **#3** v3 / claude-sonnet-5-5 / none:
  - Assumed the mirrored sliding door on the left is a reach-in closet about 2 ft deep; the other doors are treated as the room entry and not as extra floor area.
  - Furniture such as the bed, desk, and chair was ignored because flooring goes underneath.
  - Measuring the room's longer wall or adding a photo from a corner would tighten the estimate.
- **#4** v3 / claude-haiku-5-5 / none:
  - Assumed the mirrored sliding door is a reach-in closet about 6 ft wide and 2 ft deep.
  - Assumed an 8 ft ceiling and an 80 in door height for scale.
  - Adding a photo of the far corner, or measuring the room's longer wall, would tighten this estimate.
- **#5** v2 / claude-sonnet-5-5 / known-shortest:
  - A photo from the doorway showing the full length of the room would tighten the length estimate.
  - The mirrored sliding door on the left looks like a closet; its size is assumed and not shown, so measure it if you can.
  - I treated the second white door in photo 2 as a closet or bathroom door and did not add its floor.
- **#6** v2 / claude-haiku-5-5 / known-shortest:
  - Assumed the bed is a queen, so its size was used as a scale reference.
  - The white panel door in the middle of Photo 2 may be a second closet; its footprint was not included because its contents are hidden.
  - Measuring the room's length wall to wall with a tape would tighten the estimate the most.
- **#7** v3 / claude-sonnet-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep and about 5.5 ft wide.
  - Furniture, the bed and boxes were ignored since flooring goes under them.
  - Adding a photo from the doorway showing the full length of the room would tighten the longer dimension.
- **#8** v3 / claude-haiku-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep.
  - Assumed the bed is a standard queen, about 5 ft wide, to judge the room's length.
  - A photo from the far corner of the room opposite the bed would help narrow the length estimate.
- **#9** v2 / claude-sonnet-5-5 / none:
  - A wall-to-wall tape measurement of the longest wall would improve this estimate a lot.
  - The closet size is assumed from the mirrored sliding door and a typical 2 ft depth; its inside wasn't visible.
  - I treated the door on the left in Photo 2 as a possible closet or bathroom and left it out; the other door is assumed to be the room entry.
- **#10** v2 / claude-haiku-5-5 / none:
  - Assumed a queen bed (60 in wide) and a standard 30 in entry door as the main scale references.
  - Assumed the mirrored sliding closet is about 2 ft deep and the white door alcove is part of the hallway, not this room.
  - A tape-measure reading of one wall, wall to wall, would make this estimate much more accurate.
- **#11** v3 / claude-sonnet-5-5 / none:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep and roughly 5 ft wide.
  - Assumed the two white panel doors are a room entry and a closet or bathroom, so only the mirrored closet was added.
  - Measuring the room's longer wall would tighten this estimate.
- **#12** v3 / claude-haiku-5-5 / none:
  - Assumed the mirrored sliding door is a closet about 2 ft deep.
  - Assumed the white door in the alcove opens to a shallow closet about 2 ft deep.
  - A photo from the far corner of the room would help narrow the length estimate.
- **#13** v2 / claude-sonnet-5-5 / known-shortest:
  - A wide photo of the full floor from the doorway would help confirm the longer dimension.
  - The mirrored sliding closet on the left of photo 2 is included with an assumed reach-in size; its depth and width are uncertain.
  - The other door in photo 2 may be a bathroom or second closet and is not counted; add it if flooring goes there.
- **#14** v2 / claude-haiku-5-5 / known-shortest:
  - I assumed the 9.02 ft measurement is the width of the room, the side across from the bed's headboard wall.
  - The closet estimate is based on the sliding mirror door only; a photo fully inside the closet would tighten it.
  - A photo showing the full length of the room from one end would help narrow the length estimate.
- **#15** v3 / claude-sonnet-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep.
  - The second white door beside the entry door was treated as another room and not included.
  - Measuring the room's longer wall or adding a photo from the doorway would tighten the estimate.
- **#16** v3 / claude-haiku-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep.
  - Room length is estimated from the bed and door; measuring the longer wall would tighten the estimate.
- **#17** v2 / claude-sonnet-5-5 / none:
  - Assumed the mirrored sliding doors hide a reach-in closet about 2 ft deep; the second white door was treated as the room entry or another door, not part of this floor.
  - A photo from a corner looking across the full length of the room, or one tape measurement of a wall, would improve this estimate a lot.
  - Room is furnished; flooring under the bed and desk was included in the main area.
- **#18** v2 / claude-haiku-5-5 / none:
  - A measurement of one wall, such as the long wall the bed sits against, would make this estimate much more accurate.
  - I assumed a queen bed and 8 ft ceilings as scale references; if the bed is a full size, the room may be slightly smaller.
  - I did not count the white hinged door in the alcove beside the black bag as a closet; if it opens to a closet, that closet needs to be added.
- **#19** v3 / claude-sonnet-5-5 / none:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep and roughly 6 ft wide.
  - Assumed the second white panel door is the room entry or another door, not extra floor area.
  - Measuring the room's longer wall would tighten the estimate.
- **#20** v3 / claude-haiku-5-5 / none:
  - Assumed the sliding mirrored door is a reach-in closet about 2 ft deep.
  - Assumed the white hinged door next to it is a closet about 2 ft deep.
  - A photo from the opposite corner, or measuring the longer wall, would narrow the range.
- **#21** v2 / claude-sonnet-5-5 / known-shortest:
  - The mirrored sliding doors on the left in Photo 2 are assumed to be a reach-in closet about 2 ft deep; its width is a rough guess.
  - The second white door in Photo 2 is assumed to be a separate closet or room entry, so it is not counted as floor area.
  - A photo from the doorway showing the full floor length with a tape measure or door in view would narrow the range.
- **#22** v2 / claude-haiku-5-5 / known-shortest:
  - A wall-to-wall length measurement would make the room length much more accurate.
  - The closet is estimated as a 2 ft deep reach-in behind the mirrored sliding doors; the white door in the alcove beside the trash bag was not counted as a closet because its purpose is unclear.
  - The bed and desk are movable, so they were not treated as obstacles and flooring is assumed to go under them.
- **#23** v3 / claude-sonnet-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep and 5-6 ft wide.
  - The longer dimension is estimated from the bed and door sizes; measuring the longer wall would tighten the result.
  - A photo taken from a corner showing the full floor would improve accuracy.
- **#24** v3 / claude-haiku-5-5 / known-shortest:
  - Assumed the mirrored sliding door is a reach-in closet about 2 ft deep.
  - Length was estimated from the door and switch sizes because the long wall is not measured.
  - The bed and furniture are movable, so flooring was measured under them as well.
