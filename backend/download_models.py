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
        print(f"Downloading {url}...")
        urllib.request.urlretrieve(url, filename=output_path)

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

if __name__ == "__main__":
    main()
