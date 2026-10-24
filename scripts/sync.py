#!/usr/bin/env python3
"""Pulls the DiamondTier player list and writes public/players.json.

Your own edits live in overrides.json, so they are never lost when this runs.
Needs nothing installed: only Python's standard library.
"""
import json, os, re, sys, urllib.request

SOURCE = "https://diamondtier.lovable.app/api/players/txt"
OUT = "public/players.json"
MODES = {"crystal", "sword", "axe", "mace", "nethpot", "uhc", "dsmp", "smp"}
TIER = re.compile(r"^[HL]T[1-5]$")


def read_source():
    path = os.environ.get("SOURCE_FILE")  # for testing with a local file
    if path:
        return open(path, encoding="utf-8").read()
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "DiamondTier-sync"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def parse(text):
    players = []
    for line in text.splitlines():
        if " — " not in line:
            continue
        name, rest = line.split(" — ", 1)
        name = name.strip()
        tiers = {}
        for part in rest.split("|"):
            m = re.match(r"\s*(\w+):\s*([HL]T[1-5])", part)
            if m and m.group(1) in MODES and TIER.match(m.group(2)):
                tiers[m.group(1)] = m.group(2)
        if name and tiers:
            players.append({"name": name, "tiers": tiers})
    return players


def main():
    try:
        players = parse(read_source())
    except Exception as e:
        print("Could not download the list, keeping the old file:", e)
        return 0
    if len(players) < 10:  # something is wrong with the source; do not wipe the site
        print("Source looks wrong (%d players), keeping the old file." % len(players))
        return 0

    ov = json.load(open("overrides.json", encoding="utf-8"))
    rename = {k.lower(): v for k, v in ov.get("rename", {}).items()}
    remove = {n.lower() for n in ov.get("remove", [])}
    regions =
