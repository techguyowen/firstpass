import torch

def get_device() -> str:
    if torch.cuda.is_available():
        return 'cuda'
    elif torch.backends.mps.is_available():
        return 'mps'
    else:
        return 'cpu'

def get_gpu_info() -> dict:
    device = get_device()
    info = {
        "available": device != 'cpu',
        "type": device,
        "name": "CPU"
    }
    
    if device == 'cuda':
        info["name"] = torch.cuda.get_device_name(0)
    elif device == 'mps':
        info["name"] = "Apple Silicon GPU"
        
    return info
