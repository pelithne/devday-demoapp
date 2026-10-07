import argparse
from pathlib import Path
import re

IMAGE_NAMES = {"devday-frontend", "devday-backend", "devday-hello-world"}


def update_images(registry, revision, path):
    if not re.fullmatch(r"[a-z0-9]+\.azurecr\.io", registry):
        raise ValueError("Expected an Azure Container Registry hostname.")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected a full Git commit SHA.")
    original = path.read_text()
    pattern = r"(?m)^    newName: .*/(devday-(?:frontend|backend|hello-world))$"
    names = re.findall(pattern, original)
    if len(names) != len(IMAGE_NAMES) or set(names) != IMAGE_NAMES:
        raise ValueError("Expected one image each for frontend, backend, and hello-world.")
    updated, names = re.subn(
        pattern,
        lambda match: f"    newName: {registry}/{match[1]}",
        original,
    )
    updated, tags = re.subn(r"(?m)^    newTag: \S+$", f"    newTag: {revision}", updated)
    if names != len(IMAGE_NAMES) or tags != len(IMAGE_NAMES):
        raise ValueError("Expected exactly three image names and three image tags.")
    path.write_text(updated)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("registry")
    parser.add_argument("revision")
    arguments = parser.parse_args()
    update_images(arguments.registry, arguments.revision, Path("deploy/kustomization.yaml"))
