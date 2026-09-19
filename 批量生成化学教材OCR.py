from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import shutil
import subprocess
import pymupdf as fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent
PY_ENV = dict(os.environ, OMP_THREAD_LIMIT='1')
BOOKS = [
    ('e4b37691-459d-46c2-8807-dd36b3199348', '化学必修第二册'),
    ('31313b43-2159-469c-9ee8-142b29ca1b7d', '化学选择性必修1-化学反应原理'),
    ('4e2be9b1-793c-4b35-acb6-ae97fd50a93e', '化学选择性必修2-物质结构与性质'),
    ('a630b839-ed1d-40cb-99a0-aabfab26ab20', '化学选择性必修3-有机化学基础'),
]
summary = []

for identifier, name in BOOKS:
    folder = ROOT / (name + '-逐页图片')
    folder.mkdir(exist_ok=True)
    ocr = folder / 'ocr'
    ocr.mkdir(exist_ok=True)
    metadata = folder / 'source-metadata.json'
    if not metadata.exists():
        shutil.copyfile('/tmp/highchem-catalog/' + identifier + '.json', metadata)
    data = json.loads(metadata.read_text())
    item = next(t for t in data['ti_items'] if t['ti_file_flag'] == 'image')
    pages = int(next(r['value'] for r in item['custom_properties']['requirements'] if r['name'] == 'pagesize'))
    base = next(u for u in item['ti_storages'] if 'r2-ndr' in u)
    print(f'{name}: START {pages} pages', flush=True)

    def download(n):
        image_path = folder / f'{n:03}.jpg'
        url = f'{base}/{n}.jpg'
        if not image_path.exists():
            temporary = image_path.with_suffix('.part')
            subprocess.run(['curl', '-sSL', '--fail', '--retry', '3', '--max-time', '90', url, '-o', str(temporary)], check=True)
            with Image.open(temporary) as image:
                image.verify()
            temporary.rename(image_path)
        with Image.open(image_path) as image:
            width, height = image.size
            image.verify()
        return {'page': n, 'file': image_path.name, 'url': url, 'width': width, 'height': height,
                'bytes': image_path.stat().st_size, 'sha256': hashlib.sha256(image_path.read_bytes()).hexdigest()}

    records = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(download, n) for n in range(1, pages + 1)]
        for future in as_completed(futures):
            records.append(future.result())
            if len(records) % 20 == 0 or len(records) == pages:
                print(f'{name}: images {len(records)}/{pages}', flush=True)
    records.sort(key=lambda r: r['page'])
    (folder / 'manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))

    def recognize(n):
        prefix = ocr / f'{n:03}'
        if not prefix.with_suffix('.pdf').exists():
            subprocess.run(['tesseract', str(folder / f'{n:03}.jpg'), str(prefix), '-l', 'chi_sim+eng',
                            '--dpi', '180', '-c', 'textonly_pdf=1', 'pdf'], env=PY_ENV, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return n

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(recognize, n) for n in range(1, pages + 1)]
        for count, future in enumerate(as_completed(futures), 1):
            future.result()
            if count % 20 == 0 or count == pages:
                print(f'{name}: OCR {count}/{pages}', flush=True)

    doc = fitz.open()
    texts = []
    for r in records:
        width, height = r['width'] * 72 / 180, r['height'] * 72 / 180
        page = doc.new_page(width=width, height=height)
        page.insert_image(page.rect, filename=str(folder / r['file']))
        with fitz.open(ocr / f'{r["page"]:03}.pdf') as layer:
            page.show_pdf_page(page.rect, layer, 0)
        texts.append(f'\n\n--- PDF 第 {r["page"]} 页 ---\n' + page.get_text())
    doc.set_metadata({'title': data['title'] + '（上海科学技术出版社，OCR文字版）',
                      'subject': '逐页原图加OCR文字层，化学式和上下标请以原图为准。'})
    output = ROOT / (name + '-上海科学技术出版社-可搜索文字版.pdf')
    temporary_pdf = output.with_suffix('.tmp.pdf')
    doc.save(temporary_pdf, deflate=True, garbage=3)
    doc.close()
    temporary_pdf.replace(output)
    (ROOT / (name + '-OCR文字.txt')).write_text(''.join(texts), encoding='utf-8')

    with fitz.open(output) as check:
        assert len(check) == pages
        characters = [len(p.get_text().strip()) for p in check]
        assert sum(characters) > 10000
        for i, page in enumerate(check):
            images = page.get_images()
            assert len(images) == 1, (i, len(images))
            embedded = check.extract_image(images[0][0])['image']
            assert hashlib.sha256(embedded).hexdigest() == records[i]['sha256'], i
        for n in [0, min(11, pages-1), pages-1]:
            page = check[n]
            page.get_pixmap(matrix=fitz.Matrix(800/page.rect.width, 800/page.rect.width)).save(str(ocr / f'preview-{n+1:03}.png'))
        result = {'title': data['title'], 'pdf': str(output), 'pages': pages, 'bytes': output.stat().st_size,
                  'text_characters': sum(characters), 'pages_with_text': sum(c > 0 for c in characters),
                  'pages_without_ocr_text': [i+1 for i,c in enumerate(characters) if c == 0],
                  'all_original_images_verified': True}
    (folder / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    summary.append(result)
    (ROOT / '其余四册-OCR处理结果.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print('COMPLETE ' + json.dumps(result, ensure_ascii=False), flush=True)
