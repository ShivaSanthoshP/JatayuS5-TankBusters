from __future__ import annotations
"""Shared utilities for the agent pipeline."""

import re

# Pattern used by both monitoring and predictive agents to parse metric history lines.
HISTORY_LINE_PATTERN = re.compile(
    r"CPU=(?P<cpu>[\d.]+)% MEM=(?P<mem>[\d.]+)% DISK=(?P<disk>[\d.]+)% "
    r"ERR=(?P<err>[\d.]+)% LAT=(?P<lat>[\d.]+)ms NET_IN=(?P<net>[\d.]+)Mbps"
)
