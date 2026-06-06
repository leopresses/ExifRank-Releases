import os
from PIL import Image

def generate_light_installer_images():
    print("Gerando imagens CLARAS para o instalador Inno Setup...")
    
    # Cores Claras
    bg_color = (255, 255, 255)  # Branco
    sidebar_color = (248, 249, 250) # Cinza muito clarinho, estilo moderno
    
    # 1. WizardImageFile: The large left-side image on the first page (164x314)
    # We'll make it a very light grey with the icon centered
    wizard_large = Image.new('RGB', (164, 314), sidebar_color)
    
    # Load the app icon
    icon_path = 'icone.ico'
    if os.path.exists(icon_path):
        try:
            icon = Image.open(icon_path)
            # Try to get the largest size from the icon if it has multiple sizes
            # Or just resize cleanly
            icon = icon.resize((96, 96), Image.Resampling.LANCZOS)
            
            # Since icon might be RGBA, we need to paste it with alpha mask
            if icon.mode == 'RGBA':
                # Center it horizontally, put it a bit towards the top
                pos = ((164 - 96) // 2, 40)
                wizard_large.paste(icon, pos, icon)
            else:
                pos = ((164 - 96) // 2, 40)
                wizard_large.paste(icon, pos)
        except Exception as e:
            print("Não conseguiu carregar o icone no large:", e)
            
    wizard_large.save("wizard_large.bmp")
    print("Criado wizard_large.bmp")
    
    # 2. WizardSmallImageFile: The small top-right image on subsequent pages (55x55 or 58x58)
    wizard_small = Image.new('RGB', (55, 55), bg_color)
    if os.path.exists(icon_path):
        try:
            icon = Image.open(icon_path)
            icon = icon.resize((40, 40), Image.Resampling.LANCZOS)
            if icon.mode == 'RGBA':
                pos = ((55 - 40) // 2, (55 - 40) // 2)
                wizard_small.paste(icon, pos, icon)
            else:
                pos = ((55 - 40) // 2, (55 - 40) // 2)
                wizard_small.paste(icon, pos)
        except Exception as e:
            print("Não conseguiu carregar o icone no small:", e)

    wizard_small.save("wizard_small.bmp")
    print("Criado wizard_small.bmp")

if __name__ == "__main__":
    generate_light_installer_images()
