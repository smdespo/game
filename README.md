# Shadow Fighter (cinematic silhouette prototype)
Open `index.html` in Chrome (internet needed for the Phaser CDN), or use VS Code Live Server.
Desktop: A/D or arrows move, SPACE/Up jump, J punch, K kick, L block, Enter restart.
Mobile: left joystick (horizontal), right buttons JUMP / PUNCH / KICK / BLOCK (hold).
Round: 99s timer; at 0 the fighter with more HP wins.
Visuals are all procedural (Phaser Graphics). To swap in sprites later: replace `buildPose/paint` in `updateFighterVisuals`
and hook `onStateChange`. Sprite names: assets/player/player_{idle,run,jump,punch,kick,block,hit,death}.png, same for enemy.