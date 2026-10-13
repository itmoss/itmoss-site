#!/usr/bin/env python3
"""예전 이름 호환 — scripts/loop.py status 와 같다. 새로 쓰는 곳은 loop.py 를 부른다."""
import os, sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import importlib.util

spec = importlib.util.spec_from_file_location("loop", os.path.join(here, "loop.py"))
loop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loop)
loop.main(["status"] + sys.argv[1:])
