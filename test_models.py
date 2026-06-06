import urllib.request, json, re
try:
    key_file = r'C:\Users\Leonardo\AppData\Roaming\Nexus\dados.json'
    with open(key_file, 'r', encoding='utf-8') as f:
        data = f.read()
    match = re.search(r'"groq_key":\s*"([^"]+)"', data)
    key = match.group(1)
    req = urllib.request.Request('https://api.groq.com/openai/v1/models', headers={'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req) as response:
        models_data = json.loads(response.read().decode())
        vision_models = [m['id'] for m in models_data['data'] if 'vision' in m['id'].lower()]
        all_models = [m['id'] for m in models_data['data']]
        print('Vision Models:', vision_models)
        print('All Models:', all_models)
except Exception as e:
    print('Erro:', e)
