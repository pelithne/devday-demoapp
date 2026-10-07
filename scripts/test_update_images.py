from pathlib import Path
import tempfile
import unittest

from update_images import update_images


class ImageUpdateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "kustomization.yaml"
        source = Path(__file__).resolve().parents[1] / "deploy" / "kustomization.yaml"
        self.path.write_text(source.read_text())

    def test_updates_both_images_and_is_idempotent(self):
        revision = "a" * 40
        update_images("test.azurecr.io", revision, self.path)
        first = self.path.read_text()
        self.assertEqual(first.count("newTag: " + revision), 2)
        self.assertEqual(first.count("newName: test.azurecr.io/"), 2)
        update_images("test.azurecr.io", revision, self.path)
        self.assertEqual(self.path.read_text(), first)

    def test_invalid_input_does_not_modify_manifests(self):
        original = self.path.read_text()
        for registry, revision in (("invalid", "a" * 40), ("test.azurecr.io", "latest")):
            with self.subTest(registry=registry, revision=revision):
                with self.assertRaises(ValueError):
                    update_images(registry, revision, self.path)
                self.assertEqual(self.path.read_text(), original)

    def test_unexpected_manifest_structure_is_rejected(self):
        self.path.write_text("images: []\n")
        with self.assertRaises(ValueError):
            update_images("test.azurecr.io", "a" * 40, self.path)
        self.assertEqual(self.path.read_text(), "images: []\n")
