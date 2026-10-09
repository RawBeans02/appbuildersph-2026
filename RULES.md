# RULES — AppBuildersPH Hackathon 2026 (official)

Sources: the official challenge briefing slides (1:00 PM Fri Oct 9; quotes are word for word), appbuildersph.com/hackathon, and the organizers' Oct 8 reminder on the Cerebral Valley event page. Where the slides and the Oct 8 reminder differ, the slides win. Anything not from the slides is labeled with where it came from. A few spots on the slides were hidden in our screenshots; those are marked, and any guess is labeled as one.

## Theme and challenge (revealed 1:00 PM Fri Oct 9)
- Theme: **Local AI**
  > "Useful AI experiences where meaningful AI computation happens on the user's device, rather than depending entirely on cloud inference."
  >
  > "This is different from building an AI product for a local audience."
- Challenge:
  > "Build an AI product that remains genuinely useful when the cloud disappears."
- What they're asking for:
  > "Create a working product that uses AI running locally on a user's device to solve a real problem."
  >
  > "Show why running AI locally creates an experience that would be difficult, expensive, slow, private, or impossible with a cloud-only approach."
- Any kind of product: productivity, developer tools, accessibility, education, finance, gaming, disaster (cut off on the slide; likely disaster response), creative tools, enterprise tools, computer vision, personal assistants, privacy tools, and more (cut off).
- Tools they list as examples: Ollama, LM Studio, llama.cpp, MLX, ONNX, PyTorch, TensorFlow, WebGPU, Core ML, AMD ROCm, DirectML, Hugging Face, plus open-source LLMs, vision models and speech models. The end of that slide line was hidden; the FAQ answers it: "No. Any model, framework, operating system, or hardware platform works."
- How we read it (our interpretation, not official wording): the core AI runs on the user's device, and the product keeps its core value with no internet at all (airplane mode), not just a degraded mode. Any cloud part is secondary and never the core inference. "Local" means on-device, not "for Filipinos."

## Technical requirements (official)
**Required:**
- Substantially built during the hackathon
- A meaningful part of AI inference executes locally
- A working product, demonstrated
- Models, APIs, frameworks, and major tools disclosed
- Core Local AI functionality works without depending entirely on a cloud AI API

**Allowed:**
- Existing open-source models and libraries
- AI-assisted development
- Devin
- Cloud APIs as secondary components

## Judging criteria (official weights)
| Weight | Criterion | The judges' question |
|---|---|---|
| **25%** | Problem & Usefulness | Does it solve a genuine problem for a clear target user? |
| **25%** | Local AI Implementation | Is local inference fundamental, and does it give a meaningful advantage? |
| **20%** | Technical Execution | Does it actually work, reliably enough for a live demonstration? |
| **15%** | Innovation | Is it meaningfully different? Does Local AI enable something new? |
| **15%** | Product & Demo Quality | Is the UX usable, and is the live demonstration convincing? |

> "Half the score is usefulness and how real your Local AI is."

Special-award criteria (WhiteCloak, Cognition/Devin, AMD, Tutorials Dojo): not in the slides we captured. People's Choice is an audience vote during Demo Day.

## Submission (deadline 10:00 AM Sat Oct 10, no extensions)
Submit on the Cerebral Valley event page; the code freezes at the deadline (both from the Oct 8 reminder). The official checklist:

| The project | The proof | The disclosures |
|---|---|---|
| Project name | Demo video | Models used |
| Short description | X / LinkedIn video URL | Technologies and frameworks |
| Team members | What runs locally | APIs and cloud services |
| Public GitHub repository | What requires internet | Existing code and assets |
| | | AI development tools |

**Every submission must answer:** "Why does this product benefit from running AI locally?"

Also, from the Oct 8 reminder:
- The demo video is about **1 minute**.
- The X or LinkedIn post carries the video, tags Cognition/Devin and uses #AppBuildersPH.
- Give the official team name, the members, and each member's role and contributions.
- A live deployment isn't required if the repo tells the judges how to recreate it.

Our README has a section for every row of the checklist; see `TASKS.md`.

## Eligibility and hard rules (a break = disqualification or a disputed result)
- "Only participants listed on the official AppBuildersPH website are allowed to compete." Teams and team names can still change, as long as we submit our official team name and member names from that list. Members not on the official list are disqualified (our reading: never submit with anyone who isn't on it).
- One person = one team. One team = one project (Oct 8 reminder).
- No external help: participants proven to have received help from people outside the hackathon are disqualified.
- Results can be disputed if a team is proven to have broken the rules, "including but not limited to": a pre-existing project, receiving external help, fake benchmarks.
- Reusing code written before today: "Your project must be substantially built during the hackathon. Disclose any existing code or assets." (Our only pre-event material is process docs, no product code; we disclose them.)

## FAQ (official, page 1 of 7: rules and tools; pages 2–7 not captured)
- **Cloud APIs?** "Yes, as secondary components. Your core Local AI functionality must not depend entirely on a cloud AI API."
- **AI coding tools like Devin?** "Yes. AI-assisted development and Devin are allowed. Disclose the tools you used."
- **Open-source models and libraries?** "Yes. Disclose every model, framework, and API in your submission."
- **Code written before today?** "Your project must be substantially built during the hackathon. Disclose any existing code or assets."
- **A specific model, OS or hardware?** "No. Any model, framework, operating system, or hardware platform works."
- **Help from people outside the hackathon?** "No. Participants proven to have received external help from people outside the hackathon are disquali…" (the end was hidden behind the speaker's webcam; it is almost certainly "disqualified").

## Demo Day — Sat Oct 10, Cyberzone, SM Makati
| Time | Item |
|---|---|
| 12:00 PM | Registration and participant arrival |
| **12:15 PM** | **Demo and AV technical checks: be there for this** |
| 1:00 PM | Official opening and AppBuildersPH welcome; finalists announced |
| 1:15 PM | PCExpress welcome |
| 1:20 PM | AMD segment |
| 1:30 PM | Cognition / Devin segment |
| 1:40 PM | Finalist pitching begins |
| 3:20 PM | Break and networking |
| 3:40 PM | Finalist pitching continues |
| 5:00 PM | Judging deliberation, PC Express auction and raffle |
| 5:45 PM | Awards ceremony |
| 6:30 PM | Networking |
| 7:00 PM | Event ends (the first digit was hidden; 7 fits the sequence) |

- Finalists get **5 minutes to pitch and demo live, then 3 minutes of judge Q&A** (8 minutes per team). "Prioritize showing a working product over presenting a large number of slides."
- From the Oct 8 reminder: at least one team member must be on-site by noon to be a finalist; no remote pitching. Expect technical questions: how it works, decisions, architecture, the AI implementation, its limitations, and what each person built; judges may review the code. Bring our own laptop; Wi-Fi, power, HDMI and USB-C are provided.
- People's Choice is an audience vote during Demo Day (by QR code, per the Oct 8 reminder).

## Awards (₱135,000 cash, 6 awards)
"Special awards may be won independently of…" (the rest of that slide line was cut off). Teams keep ownership of what they build (Oct 8 reminder).

| Award | Prize |
|---|---|
| Grand Champion (best overall project) | ₱50,000 cash + AMD/ASUS peripherals + Devin AI credits |
| WhiteCloak Award | ₱15,000 cash + WhiteCloak merch |
| Cognition / Devin Award | ₱10,000 cash |
| AMD Award | ₱10,000 cash + AMD/ASUS peripherals |
| People's Choice Award | ₱10,000 cash (audience vote during Demo Day) |
| Tutorials Dojo Award | ₱10,000 cash each, four winners |

## Links
- Official site: https://appbuildersph.com/hackathon/
- Official participant list: https://appbuildersph.com/hackathon/participants
- Questions (Oct 8 reminder): the official Telegram group, or Bryl Lim (organizer) and the organizers on Demo Day.

## Notes from the briefing
- The FAQ has 7 pages; we captured only page 1. Add anything from pages 2–7 here.
