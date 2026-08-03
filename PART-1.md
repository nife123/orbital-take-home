### The problem and its context

Nova Learning is an online learning platform for primary school children. Last year, we were losing 30% of our customers every month – a rate at which the business could not survive. The signal behind the number was consistent: parents reported that their children sometimes got stuck in the learning material without adequate support. My hypothesis was that the missing ingredient was live human support at the moment of difficulty. I proposed and then designed and built, end-to-end, a video classroom: a scheduled live session in which a tutor supervises a group of children working through their lessons, sees each child’s screen and progress in real time, and can intervene with students who are stuck. Critically, the classroom is asymmetric – the tutor sees every student, but each student only sees the tutor and never the other students.

### Complexity and constraints

I built the classroom on Daily.co’s call-object API : an SDK providing media transport and no user interface. A couple of things made the build-out technically challenging:

**Distributed state with no server holding the truth.** A classroom has state: who is muted, who can hear the tutor, who has a hand raised, what lesson each child is on, who is on question four of a given lesson quiz etc. The state lives across the users’ browsers with no server owning it. I built the convergence myself – a message protocol over the Daily.co’s SDK data channel. In short, I built consensus across N browsers with no coordinator.

**An asymmetric media topology that is no SDK's default.** Every video conferencing SDK assumes symmetry: everyone sees everyone. My requirement was deliberately asymmetric. There is no configuration flag for this. It meant disabling automatic track subscription entirely and managing which video & audio feeds of other participants that each participant was subscribed to, recomputed on every join and leave – logic I own, and that has to stay correct as people leave and join the classroom.

The constraints were also as shaping as the technical problem:

**Resource.** I was the single engineer working on this. I designed, built and shipped this solo – frontend, backend, infrastructure – while simultaneously being involved in running the rest of the platform.

**Business.** Every other feature on the platform has near-zero marginal cost. This one carries real per-student-hour cost on two axes: video minutes and tutor wages. The feature had to lift retention by more than it cost to run, or it would’ve been net-negative.

**Time.** At 30% monthly churn, the business was losing roughly a third of its customers every month while I built.

**Users.** Primary school children, on the available devices they had in their homes, with no ability to troubleshoot and no patience for classroom sessions that had bugs or issues.

### My approach

Architecturally, the backend owns classroom scheduling and allocation: it reconciles our classroom records against the live rooms on the Daily.co video provider, assigns each child to a classroom for their scheduled lessons, and mints owner-privileged meeting tokens for tutors. The frontend is a React application that displays upcoming lessons, then a device check so children resolve camera and microphone problems before entering a live class, then allows them to join the classroom. It has two role-based views (tutor and student) and admin tooling lets staff manage classroom schedules and allocation without me.

The foundational decision was build vs buy and at which layer. There were 4 options that I could have gone with:

**Raw WebRTC.** This would have taken several months of development on cross-browser media before delivering any product value.

**Zoom / Google Meets Links.** This would have meant no control over the experience. It would give you a meeting where everyone is a peer – no roles, no one-way visibility, no tutor control – and it takes children out of the product.

**Daily.co's prebuilt UI.** Fastest to ship, but a prebuilt video conferencing UI cannot express ‘students can’t see each other’ or ‘tutor watches live quiz answers’

**Daily.co's headless call-object API.** This is the approach I went with: I bought the commodity and built the product. It meant I took on substantially more implementation complexity – building the entire UI and control layer myself – in exchange for owning the classroom semantics. Buying the transport was the boring, correct decision; buying the UI would have killed the feature.

### Impact

The impact of the video conferencing feature was that monthly churn halved, from 30% to 15%. For users, the effect was the one we set out to create: children got help at the moment they were stuck, and parents told us the additional layer of tutor support was what made the platform worth paying for.

### Reflection

If I tackled this again, I would have tested the core hypothesis that the missing ingredient was live human support before committing to the full build. My assumption – that children needed live tutor interaction – turned out to be right, but I validated it by building the entire classroom rather than by running a small pilot with a subset of students and manually scheduled calls. I would also design the tutor and student experiences as fully separated out component trees rather than one shared tree as this would have made the code easier to maintain and follow.




