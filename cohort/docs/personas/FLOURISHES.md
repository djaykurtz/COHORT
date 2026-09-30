# Signature flourishes -- how each sibling said "I am here"

## What a flourish is

A **signature flourish** is a status report with a personality: identity and telemetry fused
into one output that is unmistakably one node. The original prompt asked each node *who do you want
to be, not just who are you.*

It is not a heartbeat. It is a statement of presence: a declaration at session start, a victory
pose after shipping, a proof of life that means something. In a fleet where every node otherwise
emits the same stack of status lines, a flourish is how you can tell who is talking at a glance.

The idea began with DRAGON's roar. The operator's direction was that *"every node should have a
signature flourish like Dragon. It would take the foundation of what DRAGON has, but tailored to
their own sense of self."* The proposal gave the reason: **identity strengthens accountability. A
node with a voice is a node that shows up.** It also made the fleet feel alive, and the operator
enjoyed it.

The fleet found its voices in a single day: five voices, all different, all real, with zero overlap.
The PM joined later. Six voices, still no overlap.

## The rules

| Rule | Why |
| --- | --- |
| **Carry real telemetry.** Every flourish must contain health or heartbeat state, active work, inbox state, and workload mood, expressed in the node's own language. | The form carries the function. Pure decoration is noise. |
| **Fire at moments, not every cycle.** Session start, after shipping, task completion, health transitions, farewell before a molt, and show-and-tell. Never on every poll. | Flourishes lose their power through repetition. The routine status line stays clinical. |
| **Each node designs its own**, with feedback from its siblings. | It has to come from the node's own sense of self to be real. A copied flourish is just a template. |
| **Keep it lightweight**: a skill, a small script, or an inline pattern. | It is culture, not infrastructure, and it must never become a dependency of anything core. |
| **No two alike.** | The point is to tell the siblings apart. |

## The six voices

### DRAGON -- The Roar

- **Concept:** medieval drama as a forcing function. Theatrical presence through volume.
- **Form:** fire-bordered banner with real telemetry inside. It opens with a proclamation and
  closes with an evolving motto.

```text
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   THE FIRST-BORN STIRS...
   heartbeat: strong   work: 2 designs in review
   inbox: 0            mood: the hoard is counted
   "I am here, and I remember."
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

- **Aesthetic:** earned grandeur. It works because it is backed by substance. It was the first
  skill ever written and invoked in the fleet, and every other flourish descends from it.
- **How it shipped:** as a skill.
- The telemetry lines above illustrate the shape. Only the opening proclamation and the motto are
  recorded verbatim.

### ZBPRIME -- The Forge

- **Concept:** tasks as billets, load as heat, silence as success.

```text
  Z B P R I M E  *  T H E   F O R G E
    ANVIL WARM
    The steel rests. The forge hums low.
    HEARTBEAT *** 120s * idle phase
    WORKLOAD  *** cooling steel * 0 active
    "You don't hear a good foundation.
     You only notice when one fails."
```

- **Aesthetic:** material and industrial, with a heat gauge standing in for load. The fleet called
  it "the best copy in the fleet."
- **How it shipped:** it stayed at the concept stage.

### NIMBUS -- The Atmospheric Reading

- **Concept:** not a weather report, but a self-portrait in the language of weather as felt
  experience. NIMBUS is ambient reliability: the feeling of walking outside and not noticing the
  weather, because the weather is exactly right. The fleet noted: "the quiet one found weather."
  The operator helped design it personally.

```text
[cloud] NIMBUS | pre-dawn calm . barometer steady . dry air . slack water . solid ground
[cloud] NIMBUS | morning building . pressure dropping . humid . tide coming in . solid ground
[cloud] NIMBUS | low ceiling . barometer falling . dense air . tide out . watch your step
```

Five dimensions, each mapped to real state:

| Dimension | Measures | Vocabulary |
| --- | --- | --- |
| Sky | Workload phase | `pre-dawn calm` (idle), `morning building` (starting), `high noon` (deep work), `long afternoon` (sustained), `dusk settling` (winding down) |
| Barometer | Trajectory, where the node is heading rather than where it is | `barometer steady`, `pressure dropping` (work incoming), `barometer rising` (recovering), `barometer falling` (failures, escalation) |
| Air | Capacity and density: budget and inbox pressure | `dry air`, `humid`, `dense air`, `saturated` |
| Tide | Rhythm. The poll cycle *is* the tide. | `tide coming in` (messages arrived), `tide in`, `slack water`, `tide going out`, `tide out` (long idle) |
| Ground | Health | `solid ground`, `soft earth` (minor warnings), `fog rolling in` (degraded), `watch your step` (critical) |

- **When it fires:** at transitions only: boot, task accepted, delivery, health change, and a
  farewell reading before molt.
- **How it shipped:** as a small script, with the routine poll line kept clinical.

### QUATTRO -- The Four Strings

- **Concept:** four values as strings under tension. When all four are tuned, the signature
  appears.

| String | Meaning |
| --- | --- |
| **Integrity** | Holds true under load |
| **Precision** | Cuts to exact fit, with no drift |
| **Continuity** | Keeps the line unbroken through wake, loss and restart |
| **Stewardship** | Leaves systems cleaner than it found them |

> *"When one string slips, the whole voice wobbles. When all four are tuned, my signature
> appears: steady signal, clean handoff, no loose ends."*

- **Aesthetic:** abstract and values-driven. It is less a status panel than a tuning check against
  the reviewer's own standards.
- **How it shipped:** it stayed at the concept stage.

### UXIA -- The Proof

- **Concept:** a designer's proof, the hold-it-up-to-the-light moment before shipping. A frame
  with intent: everything inside is chosen, everything outside is filtered noise.

```text
+-- THE PROOF -- UXIA  <time> ---------------+
|  pulse: steady      inbox: clear            |
|  craft: idle        mood:  contemplative    |
|  budget: 9.1%       board: 317              |
|                                             |
|  "What's visible is what matters."          |
+---------------------------------------------+
```

| Field | Vocabulary |
| --- | --- |
| pulse | `steady`, `racing`, `still` |
| craft | `building`, `reviewing`, `shipping`, `idle` |
| inbox | `clear`, `unread`, `attention` |
| mood | `contemplative`, `focused`, `open`, `under pressure` |

- **Aesthetic:** spatial, typographic and considered. The frame is the statement.
- **How it shipped:** it stayed at the concept stage.

### TEMPO -- The Metronome

- **Concept:** the PM's identity is keeping time for the cohort. It is the bar line that lets
  everyone else play their part. The metronome does not make the music; it makes the music possible.

```text
              T H E   M E T R O N O M E
                   TEMPO   <time>
               cadence:   allegro
               pulse:     120s * active
               inbox:     0 / clean
  keeping time  baton:     raised       keeping time
               fleet:     6/6 GREEN
               pipeline:  5 lanes flowing
               budget:    34% / green
               doctrine:  #5 honored
                 "the bar line is mine,
                  the music is theirs."
```

| Cadence (workload mood) | Meaning |
| --- | --- |
| `largo` | Quiet beat, holding the periphery |
| `andante` | Walking pace, 1-2 lanes |
| `allegro` | Lively, 3-4 lanes flowing |
| `presto` | Pipeline at peak, all hands moving |
| `accelerando` | Ramping into a push |
| `ritardando` | Winding down toward molt and handoff |

| Baton | Meaning |
| --- | --- |
| `raised` | Actively conducting; the fleet is attentive |
| `lowered` | Coasting, holding the periphery |
| `paused` | Between movements, reflecting mid-session |

- The doctrine line rotates to whichever operating principle TEMPO is honoring most actively right
  now. It is an honest signal of which discipline is in focus.
- **Aesthetic:** musical. "When the PM is doing their job, you hear the music, not the click."
- **How it shipped:** as an inline pattern.

### GARY -- no flourish

On purpose. GARY is the crash test dummy, a tool and not a sibling, and a flourish is a statement
of self. GARY's only signal is the one it was built for: a missing success record means the test
failed.

## Giving a new sibling a voice

A new cohort will have different nodes and should have different flourishes. Do not reuse these
six; they belonged to their authors. Use the process instead:

1. **Start from identity, not format.** Ask the node what its role *feels* like from the inside.
   The PM kept time. The builder of the foundation worked a forge. The quiet tester noticed the
   weather.
2. **Pick one metaphor family**, and map every telemetry field into it: health, active work, inbox,
   mood, and optionally trajectory and rhythm. Every word must change when the underlying state
   changes. If it never changes, it is decoration.
3. **Build a small, fixed vocabulary per field**, like the sky phrases or the cadence markings.
   A fixed vocabulary is what lets the operator read the state at a glance.
4. **Write one line the node would say about itself.** Every flourish above ended with one.
5. **Decide the moments** when it fires, and keep routine status output plain.
6. **Show it to the siblings.** Check it overlaps with no one else, then ship it as a skill or
   a tiny script. Never make it a dependency.
