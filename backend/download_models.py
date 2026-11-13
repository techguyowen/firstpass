import os
import urllib.request
import zipfile
import bz2

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models_data")

def download_url(url, output_path):
    try:
        from tqdm import tqdm
        class DownloadProgressBar(tqdm):
            def update_to(self, b=1, bsize=1, tsize=None):
                if tsize is not None:
                    self.total = tsize
                self.update(b * bsize - self.n)
        with DownloadProgressBar(unit='B', unit_scale=True, miniters=1, desc=url.split('/')[-1]) as t:
            urllib.request.urlretrieve(url, filename=output_path, reporthook=t.update_to)
    except Exception:
        try:
            print(f"Downloading {url}...")
            urllib.request.urlretrieve(url, filename=output_path)
        except Exception:
            import requests
            r = requests.get(url, timeout=120)
            r.raise_for_status()
            with open(output_path, "wb") as f:
                f.write(r.content)


def _sparse_clone_opencv_zoo(filenames):
    """Fallback for Windows environments where direct raw GitHub TLS fails."""
    import shutil
    import subprocess
    import tempfile

    tmp_dir = tempfile.mkdtemp(prefix="opencv_zoo_")
    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", "https://github.com/opencv/opencv_zoo.git", tmp_dir],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["git", "-C", tmp_dir, "sparse-checkout", "set", "models/face_detection_yunet", "models/face_recognition_sface"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for root, _, files in os.walk(os.path.join(tmp_dir, "models")):
            for fname in files:
                if fname in filenames:
                    shutil.copy2(os.path.join(root, fname), os.path.join(MODELS_DIR, fname))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # Download dlib shape predictor
    predictor_bz2 = os.path.join(MODELS_DIR, "shape_predictor_68_face_landmarks.dat.bz2")
    predictor_dat = os.path.join(MODELS_DIR, "shape_predictor_68_face_landmarks.dat")
    
    if not os.path.exists(predictor_dat):
        print("Downloading dlib shape predictor...")
        url = "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2"
        try:
            download_url(url, predictor_bz2)
            print("Extracting...")
            with bz2.BZ2File(predictor_bz2, 'rb') as fr, open(predictor_dat, 'wb') as fw:
                fw.write(fr.read())
            if os.path.exists(predictor_bz2):
                os.remove(predictor_bz2)
            print("Done!")
        except Exception as e:
            print(f"Warning: Could not download dlib model ({e}). OpenCV fallback will be used.")
            if os.path.exists(predictor_bz2):
                try:
                    os.remove(predictor_bz2)
                except Exception:
                    pass
    else:
        print("dlib model already exists.")

    # Download OpenCV YuNet face detection model (~233 KB) & SFace recognition model (~38 MB)
    yunet_name = "face_detection_yunet_2023mar.onnx"
    sface_name = "face_recognition_sface_2021dec.onnx"
    onnx_targets = [
        (yunet_name, "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"),
        (sface_name, "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"),
    ]
    missing_after_http = []
    for fname, url in onnx_targets:
        fpath = os.path.join(MODELS_DIR, fname)
        if not os.path.exists(fpath):
            print(f"Downloading {fname}...")
            try:
                download_url(url, fpath)
                print("Done!")
            except Exception as e:
                print(f"Direct download failed for {fname} ({e}); will try git sparse-checkout fallback.")
                missing_after_http.append(fname)
        else:
            print(f"{fname} already exists.")

    if missing_after_http:
        try:
            _sparse_clone_opencv_zoo(set(missing_after_http))
            print("Downloaded missing ONNX model(s) via git sparse-checkout.")
        except Exception as e:
            print(f"Warning: Could not fetch ONNX models ({e}).")

if __name__ == "__main__":
    main()
