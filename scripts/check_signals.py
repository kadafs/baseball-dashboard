import json, os, glob

data_dir = r"C:\Users\markk\OneDrive\Desktop\CODE\baseball-dashboard\public\data\baseball"
files = sorted(glob.glob(os.path.join(data_dir, "*.json")))
# Use latest MLB file
mlb_files = [f for f in files if "MLB" in f or ("AAA" not in f and "AA_" not in f and "predictions_" in f and "-confirmed" in f)]
latest = mlb_files[-1] if mlb_files else files[-1]
print(f"File: {os.path.basename(latest)}")
d = json.load(open(latest))
for g in d.get("predictions", []):
    ed = g["environment"].get("env_display", {})
    sig = ed.get("signal", "?")
    lean = ed.get("lean", "?")
    pf  = g["environment"].get("park_factor", "?")
    park_flag = ed.get("park_flag", "?")
    wx_flag   = ed.get("weather_flag", "?")
    print(f"  {g['away_team'][:20]:20s} @ {g['home_team'][:20]:20s}  sig={sig:<18s}  lean={lean:<6s}  PF={pf}  park={park_flag}  wx={wx_flag}")
