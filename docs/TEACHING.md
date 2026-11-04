# Teaching vision


## 1. Connecting to Clemson Creative Inquiry

This framework supports Clemson's Creative Inquiry course,
[**Mission Control: From Human Gestures to Intelligent Robot Motion**](https://dyco-ai.github.io/go1_gesture_tracking/).
The [companion code and weekly labs](https://github.com/sriram-2502/go1-mujoco-playground)
introduce Python, MediaPipe, gesture recognition, command supervision, and Go1
simulation before supervised Go2 experiments. Students can bring their earlier
classifiers into this Windows/WebRTC instructor setup, navigate a maze using the
robot's camera view, and use recordings to explain recognition errors and motion
responses. Weekly README reports and a final analysis connect building the system
with experimental reasoning and technical communication.

## 2. Extending to modeling and control courses

A quadruped can make classroom models tangible: students predict a response,
run a bounded experiment, and compare their model with measured behavior.
The Windows 11 interface and small Python modules offer an accessible starting
point for proposed labs such as:

| Course | Possible learning activity |
| --- | --- |
| **ME 3050 — Modeling and Analysis of Dynamic Systems** | Identify a simple model from commanded and measured velocity; study time constants, delays, and model error |
| **ME 4030 — Control and Integration of Multidomain Dynamic Systems** | Connect sensing, actuation, and feedback; compare simulated and measured responses and investigate sampling and communication delays |

Course titles follow [Clemson's Mechanical Engineering descriptions](https://www.clemson.edu/cecas/departments/me/academics/summer.html).
These are proposed teaching applications. The current implementation uses Python
and browser tools; exported data can support Python or MATLAB analysis. Future
course modules could add MATLAB/Simulink workflows and validated multibody and
humanoid examples, building on this Go2 starting point.

## 3. Teaching philosophy and future faculty work

I enjoy building teaching frameworks that lower the entry barriers to advanced
robotics and control. A student should feel invited to investigate a quadruped
or humanoid, even without extensive programming or robotics experience. Familiar
Windows tools, readable examples, visual feedback, and a progression from
simulation to supervised experiments give students a place to begin while
preserving the depth of the engineering questions. This project illustrates
the approach I want to bring to undergraduate and graduate teaching as a faculty
member: connect fundamentals with current robotics research, help students build
confidence through achievable experiments, and create room for increasingly
independent inquiry.

