---
name: video-post
description: Post-production for recorded talking-head video (interviews, series episodes, personal-branding clips) - finding new footage in the channel's shoot folder, mapping takes and restarts from audio and transcript, choosing cut points, building the vertical 9:16 cut with an on-screen tag, and QA. Use whenever footage was recorded, a clip needs cutting, trimming, reviewing or checking, a take needs picking, or a test clip should be verified before a shoot, even if the user only says "I recorded something", "check the video" or "new footage".
---

# Video post-production

Tools and scripts live in `C:\ai\video-pipeline` (outside every agent repo). Read
`C:\ai\video-pipeline\README.md` for the runbook. Channels (Drive root, on-screen tag, language)
are in `C:\ai\video-pipeline\channels.json`; the channel skill says which one applies (for
Christian's own clips: `personal-branding`, section "Video post-production").

## Output: what a finished job looks like

```
<shoot>\cuts\<name>.mp4            1080x1920, 30 fps, H.264 CRF 18, AAC 192k, -14 LUFS, faststart
<shoot>\cuts\<name>.cutlist.json   clip, segments [{start,end}], faceX, punch, tag - replayable
```
plus, in the reply: which clip is the real take, the segment table (source in/out and what is
said in each), the runtime of every version, and what the QA transcript showed at each boundary.
Never call a boundary clean without the QA transcript.

## The hand-off

- Footage goes to `<channel root>\YY_MM_DD[_slug]\`, camera filenames unchanged. "New footage"
  means: run `probe.ps1` on the newest folder of that channel. Nothing is uploaded anywhere
  else - do not ask for chat attachments or upload widgets; the local pipeline reads Drive.
- Every shoot day starts with a 5-second test clip + `probe.ps1` before the real takes.

## Run order

```powershell
cd C:\ai\video-pipeline\scripts                # add -Channel <key> when it is not "personal"
.\probe.ps1                                    # 1  inventory + flags for every clip
.\takemap.ps1 -Clip DSCF0016                   # 2  segments, pauses, transcript, thumbnail sheets
.\energy.ps1  -Clip DSCF0016 -At 34.3, 85.0    # 3  quietest gap around each candidate cut
.\cut.ps1 -Clip DSCF0016 -Name tight -Segs '16.96,34.30','73.20,85.05'   # 4  (-Tag overrides)
.\qa.ps1  -Name tight                          # 5  boundary strip + transcript of the result
```
Read the thumbnail sheets (jpg) before choosing: framing, focus, posture resets.

## Rules

- Always: the clip with the most speech is the session; short-speech clips are false starts.
- Always: pauses >= 4 s are take boundaries; a restarted line means keep the *second* version.
- Always: place every cut in a measured gap (`energy.ps1`); never on whisper word times alone -
  they drift by seconds around restarts.
- Always: hook from whichever take delivers it best, body from the cleanest full run; open on
  the claim, not on a greeting, unless the greeting is all that was recorded.
- Always: QA every cut by transcribing the finished audio; a half-word at a boundary = re-cut.
- Always: when the raw run is long, deliver two lengths (full, and tight without the list-like
  passage) and recommend one; the owner reviews on a phone and decides.
- Never: upload raw footage to an external service for analysis; the local pipeline covers it.
- Never: modify the raw files; outputs only in `cuts\`.
- Camera modes can store separate settings (the Fujifilm X-S20's VLOG dial position does):
  check resolution, frame rate and mic input in the mode that will actually record.

## Example

"New footage" -> `probe` shows DSCF0014 (2:00, 25 s speech), DSCF0015 (1:18, 30 s), DSCF0016
(3:56, 3:20 speech) -> 0016 is the session. `takemap` shows the hook in the first attempt
(0:13-1:04, restart at the end) and a full run from 1:10 with one restarted line at 1:25-1:39.
Cut: hook 16.96-34.30 + run 73.20-85.05, 99.40-212.70, 216.40-231.30 -> `full` 2:37; drop the
list passage (99.40-152.83) -> `tight` 1:38. QA transcript reads clean across all boundaries.
