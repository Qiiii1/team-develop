import sys,io,json,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'.runtime'))
data=sys.stdin.buffer.read(50*1024*1024+1);ext=Path(sys.argv[1]).suffix.lower();parts=[]
try:
 if ext in ['.docx','.xlsx']:
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   if sum(i.file_size for i in z.infolist())>200*1024*1024:raise ValueError('文件解压后过大')
 if ext=='.pdf':
  from pypdf import PdfReader
  reader=PdfReader(io.BytesIO(data))
  if reader.is_encrypted:raise ValueError('请上传未加密的PDF')
  for page in reader.pages:
   parts.append(page.extract_text() or '')
   if sum(map(len,parts))>100000:break
 elif ext=='.docx':
  from docx import Document
  doc=Document(io.BytesIO(data));parts=[p.text for p in doc.paragraphs]
  for table in doc.tables:
   parts.extend(' | '.join(c.text for c in row.cells) for row in table.rows)
 elif ext=='.xlsx':
  import openpyxl
  book=openpyxl.load_workbook(io.BytesIO(data),read_only=True,data_only=True)
  for sheet in book:
   parts.append(sheet.title)
   for row in sheet.iter_rows(values_only=True):
    parts.append(' | '.join(str(v) if v is not None else '' for v in row))
    if sum(map(len,parts))>100000:break
   if sum(map(len,parts))>100000:break
  book.close()
 else:raise ValueError('暂不支持此格式，请使用 PDF、DOCX、XLSX 或文本文件')
 text='\n'.join(parts).strip()
 if not text:raise ValueError('未读取到文字，扫描件请先转为可复制文字的PDF')
 print(json.dumps({'text':text[:100000],'truncated':len(text)>100000},ensure_ascii=True))
except Exception as e:
 print(json.dumps({'error':str(e) if isinstance(e,ValueError) else '文件内容解析失败，请检查文件是否损坏'},ensure_ascii=True))
