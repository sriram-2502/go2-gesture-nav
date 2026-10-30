"""Download the same Hand Landmarker model used by the Go1 course scaffold."""
from pathlib import Path
from urllib.request import urlopen

MODEL_URL = ('https://storage.googleapis.com/mediapipe-models/hand_landmarker/'
             'hand_landmarker/float16/1/hand_landmarker.task')
MODEL_PATH = Path(__file__).resolve().parents[2] / '.tools/models/hand_landmarker.task'


def main():
    if MODEL_PATH.exists():
        print('Hand Landmarker model already available:', MODEL_PATH)
        return
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(MODEL_URL, timeout=60) as response:
        data = response.read()
    temporary = MODEL_PATH.with_suffix('.download')
    temporary.write_bytes(data)
    temporary.replace(MODEL_PATH)
    print('Downloaded Hand Landmarker model:', MODEL_PATH)


if __name__ == '__main__':
    main()
