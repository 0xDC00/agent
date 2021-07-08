# Agent
Text hooker with javascript.

## Features
- Based on script.
- Hook everything.

## Project Architecture
- The program (GUI) injects javascript and runtime into the target process.
- The script will "hook" to the correspond memory address to get the text in-game
then sent them to the translator (eg: translation aggregator, chiitrans, textractor,...)
- That alls.

### Folder Structure
```
Agent.exe              <-- GUI
📂scripts              <-- user scripts
📂bin
 └agent-32.bin         <-- runtime
 └agent-64.bin
 └agent-helper-32.bin  <-- injector
 └agent-helper-64.bin
 └init.js              <-- global script
 └log_console_         <-- log channel, based on file name.

Notes:
- Log channel:
  + log_console:  use console log (attach console to the target)
  + log_nothing:  disable log.
  + log_console_: No given file, use debug tab of the GUI. (OutputDebugString)

Change to another channel if it matches the target log.
```

## Download
Latest: <https://github.com/0xDC00/agent/archive/refs/heads/master.zip>

## Usage
- Select game from path or pick a running process (drag right-click from the first three-dots button).
- Select script.
- Press Attach button.

## Showcase & Tutorials
- Hardware Breakpoint Hook | Watchpoints\
  [![Kamigami no Asobi InFinite](https://img.youtube.com/vi/kwy_TggjTB4/1.jpg)](https://youtu.be/kwy_TggjTB4?list=PLTZXVVG9AT6TATy_7ey3jUkE0g35t3xtk)
- Inline Hook\
  [![TAISHO x ALICE Episode 1](https://img.youtube.com/vi/Ey4Fa3TSEzE/1.jpg)](https://youtu.be/Ey4Fa3TSEzE?list=PLTZXVVG9AT6TATy_7ey3jUkE0g35t3xtk)
- Inline Hook | PPSSPP - Just-In-Time (JIT) Compiler Hook\
  [![Kamigami no Asobi InFinite](https://img.youtube.com/vi/dTMCsOQR7R4/1.jpg)](https://youtu.be/dTMCsOQR7R4)

## Credits
- [Gum](https://github.com/frida/frida-gum)
- [AvalonEdit](https://github.com/icsharpcode/AvalonEdit)

## TODO
- ?