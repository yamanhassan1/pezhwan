#!/usr/bin/env python3
"""Setuptools shim for legacy tooling; pyproject.toml is the source of truth."""

from setuptools import setup

setup(
    name="pezhwan",
    version="0.1.0",
    description="Universal Identity & Access Management client for PEZHWAN",
    packages=["pezhwan"],
    python_requires=">=3.9",
    include_package_data=True,
    zip_safe=False,
)