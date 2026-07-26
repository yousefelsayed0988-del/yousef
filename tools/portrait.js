/* Freeze the world and take a controlled portrait of the Lodger.
   Injected through shot.js --eval. Reads window.__POSE__ / __DIST__ / __PITCH__ */
(function(){
  var pose = window.__POSE__ || 'idle';
  var dist = window.__DIST__ || 2.6;
  var pitch = window.__PITCH__ === undefined ? 0.02 : window.__PITCH__;
  var spd = window.__SPD__ || 0;

  // stop anything from steering the camera or the body out from under us
  updatePlayer = function(){};
  updateNoise = function(){};
  scanNear = function(){};
  ambience = function(){};

  /* find the roomiest floor cell on the map, then a direction out of it with
     a long clear run, so he is never standing inside a door frame */
  var best = null;
  for (var gy = 1; gy < MH - 1; gy++){
    for (var gx = 1; gx < MW - 1; gx++){
      if (solid(gx, gy)) continue;                 // solid() is true for WALLS
      var open = 0;
      for (var oy = -2; oy <= 2; oy++)
        for (var ox = -2; ox <= 2; ox++)
          if (!solid(gx + ox, gy + oy) && !doorAt(gx + ox, gy + oy)) open++;
      if (!best || open > best.open) best = { x: gx, y: gy, open: open };
    }
  }
  if (best){ P.x = best.x + 0.5; P.z = best.y + 0.5; }

  var bestA = P.ang, bestRun = -1;
  for (var i = 0; i < 64; i++){
    var a = i / 64 * Math.PI * 2, run = 0;
    for (var s = 0.4; s < 7; s += 0.35){
      var cx = Math.floor(P.x + Math.cos(a) * s), cy = Math.floor(P.z + Math.sin(a) * s);
      if (solid(cx, cy) || doorAt(cx, cy)) break;
      run = s;
    }
    if (run > bestRun){ bestRun = run; bestA = a; }
  }
  P.ang = bestA; lookYaw = bestA;

  // stand him at the distance we want, facing straight back down it
  V.x = P.x + Math.cos(P.ang) * dist;
  V.z = P.z + Math.sin(P.ang) * dist;
  V.ang = P.ang + Math.PI;
  V.active = true;
  V.stun = 0;
  V.rage = window.__RAGE__ || 0;
  P.pitch = pitch;
  P.torch = true;
  P.bat = 1;
  P.fear = 0;

  var t = 0;
  updateVillain = function(dt){
    t += dt;
    V.anim = window.__FREEZE__ ? window.__FREEZE__ : t;
    poseLodger(V.bones, V.anim, pose, spd, 0, window.__HY__ || 0, window.__HP__ || 0);
    placeVillain();
  };

  var hud = document.getElementById('hud');
  if (hud && window.__NOHUD__) hud.classList.remove('on');
  return 'portrait ' + pose + ' @' + dist + 'm  him=' + V.x.toFixed(2) + ',' + V.z.toFixed(2);
})()
