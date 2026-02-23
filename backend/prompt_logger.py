"""
Utility module for logging LLM prompts and responses to text files.
"""
import os
import json
from datetime import datetime
from typing import Any, Dict, Optional


def format_prompt_log(
    process_name: str,
    step: int,
    total_steps: int,
    prompt_input: Dict[str, Any],
    prompt_text: str,
    response: Any,
    provider: str = None,
    model: str = None,
    extra_info: Dict[str, Any] = None
) -> str:
    """Format a single prompt log entry"""
    timestamp = datetime.now().strftime("%Y-%m-%d %Human:%M:%S")
    separator = "=" * 80

    log_parts = [
        f"\n{separator}",
        f"[{timestamp}] PROCESS: {process_name} | Step {step}/{total_steps}",
        f"Provider: {provider or 'unknown'} | Model: {model or 'unknown'}",
    ]

    if extra_info:
        for key, value in extra_info.items():
            log_parts.append(f"{key}: {value}")

    log_parts += [
        f"{'-' * 40}",
        f">>> PROMPT INPUT VARIABLES:",
    ]

    for key, value in prompt_input.items():
        # Truncate very long values for readability
        val_str = str(value)
        if len(val_str) > 500:
            val_str = val_str[:500] + f"... [truncated, total {len(val_str)} chars]"
        log_parts.append(f"  [{key}]: {val_str}")

    log_parts += [
        f"{'-' * 40}",
        f">>> FULL PROMPT SENT TO LLM:",
        prompt_text,
        f"{'-' * 40}",
        f">>> LLM RESPONSE:",
        str(response),
        f"{separator}\n",
    ]

    return "\n".join(log_parts)


def append_prompt_log(log_file_path: str, log_entry: str):
    """Append a log entry to the specified log file"""
    os.makedirs(os.path.dirname(log_file_path) if os.path.dirname(log_file_path) else ".", exist_ok=True)
    with open(log_file_path, 'a', encoding='utf-8') as f:
        f.write(log_entry)


def init_prompt_log(log_file_path: str, process_name: str, metadata: Dict[str, Any] = None):
    """Initialize/overwrite a prompt log file with a header"""
    os.makedirs(os.path.dirname(log_file_path) if os.path.dirname(log_file_path) else ".", exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    header = (
        f"{'#' * 80}\n"
        f"# PROMPT LOG - {process_name}\n"
        f"# Started: {timestamp}\n"
    )
    if metadata:
        for key, value in metadata.items():
            header += f"# {key}: {value}\n"
    header += f"{'#' * 80}\n"

    with open(log_file_path, 'w', encoding='utf-8') as f:
        f.write(header)