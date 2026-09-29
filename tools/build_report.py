"""Rebuild the 14-page report from actual JSON evidence. Optional Python tooling."""
from pathlib import Path
import json, statistics, datetime, html
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether, Preformatted
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence'
B=json.loads((E/'benchmark-results.json').read_text())
T=json.loads((E/'test-summary.json').read_text())
D=json.loads((E/'demonstration.json').read_text())
W=B['workflow']; ENV=B['environment']; GAS=B['gas']; DEP=W['deployment']
OUT=ROOT/'docs'/'Assignment_2_Report.pdf'
TMP=ROOT/'tmp'/'report';TMP.mkdir(parents=True,exist_ok=True)
FONT=Path('/usr/share/fonts/truetype/dejavu')
pdfmetrics.registerFont(TTFont('DejaVu',str(FONT/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuBold',str(FONT/'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuMono',str(FONT/'DejaVuSansMono.ttf')))
pdfmetrics.registerFontFamily('DejaVu',normal='DejaVu',bold='DejaVuBold',italic='DejaVu',boldItalic='DejaVuBold')
NAVY=colors.HexColor('#102441');BLUE=colors.HexColor('#175BDF');GRAY=colors.HexColor('#5F6E81');LINE=colors.HexColor('#DCE3ED');PALE=colors.HexColor('#F1F5FA');GOLD=colors.HexColor('#D3A745')
WIDTH=507
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCustom',fontName='DejaVu',fontSize=9.2,leading=13.7,spaceAfter=9,textColor=NAVY))
styles.add(ParagraphStyle(name='SmallCustom',parent=styles['BodyCustom'],fontSize=8,leading=11.5,spaceAfter=7,textColor=GRAY))
styles.add(ParagraphStyle(name='H1Custom',fontName='DejaVuBold',fontSize=21,leading=26,spaceAfter=15,textColor=NAVY))
styles.add(ParagraphStyle(name='H2Custom',fontName='DejaVuBold',fontSize=11.4,leading=16,spaceBefore=9,spaceAfter=6,textColor=BLUE))
styles.add(ParagraphStyle(name='EyebrowCustom',fontName='DejaVuBold',fontSize=8,leading=12,spaceAfter=8,textColor=GRAY))
styles.add(ParagraphStyle(name='TableCustom',fontName='DejaVu',fontSize=8.2,leading=11.5,textColor=NAVY,wordWrap='CJK'))
styles.add(ParagraphStyle(name='TableHeadCustom',parent=styles['TableCustom'],fontName='DejaVuBold',textColor=colors.white))
styles.add(ParagraphStyle(name='CodeCustom',fontName='DejaVuMono',fontSize=7.3,leading=10.5,spaceAfter=10,textColor=NAVY,backColor=PALE,borderPadding=10))
styles.add(ParagraphStyle(name='CoverTitle',fontName='DejaVuBold',fontSize=31,leading=38,textColor=NAVY,spaceAfter=16))
story=[]
def p(text,style='BodyCustom'): return Paragraph(text,styles[style])
def add(text,style='BodyCustom'): story.append(p(text,style))
def h(text): add(text,'H2Custom')
def page(k,title):
    if story:story.append(PageBreak())
    add(f'ASSIGNMENT 2  /  {k:02d}','EyebrowCustom');add(title,'H1Custom')
def table(headers,rows,widths=None):
    values=[[p(html.escape(str(c)),'TableHeadCustom') for c in headers]]+[[p(html.escape(str(c)),'TableCustom') for c in row] for row in rows]
    item=Table(values,colWidths=widths or [WIDTH/len(headers)]*len(headers),repeatRows=1,hAlign='LEFT')
    item.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),.6,NAVY),('LINEBELOW',(0,1),(-1,-1),.3,LINE)]))
    story.append(item);story.append(Spacer(1,9))
def callout(title,text):
    item=Table([[p(title,'H2Custom')],[p(text)]],colWidths=[WIDTH])
    item.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('LINEBEFORE',(0,0),(-1,-1),3,GOLD),('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,0),6),('BOTTOMPADDING',(0,-1),(-1,-1),9)]))
    story.append(item);story.append(Spacer(1,12))
def fmt(value,digits=2):return f'{value:,.{digits}f}'
def group(n,c):return [s for s in B['scenarios'] if s['volume']==n and s['concurrency']==c]
def mean(n,c,key='tps'):return statistics.mean(s[key] for s in group(n,c))
def architecture():
    d=Drawing(WIDTH,227)
    def box(x,y,w,height,label,small='',fill=PALE):
        d.add(Rect(x,y,w,height,fillColor=fill,strokeColor=LINE,rx=5,ry=5));d.add(String(x+w/2,y+height/2+3,label,fontName='DejaVuBold',fontSize=9,fillColor=NAVY,textAnchor='middle'))
        if small:d.add(String(x+w/2,y+height/2-11,small,fontName='DejaVu',fontSize=7.4,fillColor=GRAY,textAnchor='middle'))
    def arrow(x1,y1,x2,y2):
        d.add(Line(x1,y1,x2,y2,strokeColor=BLUE,strokeWidth=1.2));d.add(Polygon([x2-3,y2+6,x2+3,y2+6,x2,y2],fillColor=BLUE,strokeColor=BLUE))
    box(0,172,159,48,'University / administrator','Register, approve, issue, revoke')
    box(174,172,159,48,'Student','Register, receive JSON / QR')
    box(348,172,159,48,'Employer','Upload file or scan QR')
    for x in [79.5,253.5,427.5]:arrow(x,172,x,141)
    box(0,91,507,50,'Browser DApp + local Express gateway','Canonicalize / hash | RPC proxy | verify | delivery | QR rendering')
    arrow(126,91,126,53);arrow(381,91,381,53)
    box(0,0,252,53,'Solidity registry on local EVM','Authoritative roles, commitments, revocations')
    box(269,0,238,53,'Off-chain certificate store','Exact readable JSON; recoverable delivery')
    return d
def charts():
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#172b45','text.color':'#172b45','xtick.color':'#5f6e81','ytick.color':'#5f6e81'})
    fig,ax=plt.subplots(figsize=(7.2,2.75))
    labels=['Full issuance','Transaction to receipt','After-ack confirmation wait','HTTP verification']
    stats=[W['issuanceMs'],W['transactionMs'],W['confirmationWaitMs'],W['verificationHttpMs']]
    y=list(range(4));ax.barh([i-.16 for i in y],[s['mean'] for s in stats],height=.3,label='Mean',color='#175bdf');ax.barh([i+.16 for i in y],[s['p95'] for s in stats],height=.3,label='95th percentile',color='#95b2e5');ax.set_yticks(y,labels);ax.invert_yaxis();ax.set_xlabel('Milliseconds (30 measured trials)');ax.grid(axis='x',alpha=.18);ax.set_axisbelow(True);ax.legend(loc='lower right',frameon=False);fig.tight_layout();fig.savefig(TMP/'latency.png',dpi=200);plt.close(fig)
    fig,axes=plt.subplots(1,2,figsize=(7.2,2.85))
    for ax,conditions,title,xlabel in [(axes[0],[(10,4),(50,4),(100,4)],'Volume at 4 workers','Certificates per run'),(axes[1],[(100,1),(100,4),(100,8)],'Concurrency at 100 certificates','Concurrent workers')]:
        xs=[n if xlabel.startswith('Certificates') else c for n,c in conditions];ys=[mean(n,c) for n,c in conditions];errs=[statistics.stdev(s['tps'] for s in group(n,c)) for n,c in conditions]
        ax.errorbar(xs,ys,yerr=errs,fmt='o-',capsize=4,color='#175bdf',linewidth=2);ax.set_title(title,fontsize=10);ax.set_xlabel(xlabel);ax.set_ylabel('Confirmed issuances / second');ax.set_xticks(xs);ax.set_ylim(0,max(ys)*1.25);ax.grid(alpha=.18);ax.set_axisbelow(True)
        for x,y in zip(xs,ys):ax.annotate(f'{y:.2f}',(x,y),xytext=(0,9),textcoords='offset points',ha='center',fontsize=8)
    fig.tight_layout();fig.savefig(TMP/'scalability.png',dpi=200);plt.close(fig)
charts()

# 1
page(1,'')
add('CertiLedger','CoverTitle')
add('Blockchain-Based Academic<br/>Certificate Verification System','H1Custom')
add('MSc Blockchain Course  |  Assignment 2','EyebrowCustom')
story.append(Spacer(1,15))
table(['Student details','Complete before submission'],[['Name','________________________________'],['Student / registration ID','________________________________'],['Programme / institution','________________________________'],['Evaluation date',B['finishedAt'][:10]]],[160,347])
h('Abstract')
add('CertiLedger is a working decentralized application for issuing and checking academic certificates. An administrator approves registered university wallets; approved universities issue credentials to registered students. The complete certificate is stored as readable JSON off chain, while a Solidity smart contract records its SHA-256 commitment, issuer, recipient and permanent revocation state. Employers verify an uploaded document without a wallet, or use a QR code to locate and check the original.')
add('The project includes a browser dashboard, printable certificates, a direct-RPC verification command, a local persistent EVM, automated security and integration tests, and reproducible performance measurements. The design detects changed content and unauthorized writes; institutional accreditation and the truth of an award still require trusted university processes.')
table(['Verified outcome','Measured result'],[[f'{T["passed"]} automated tests','All passed; authorization, tampering, recovery and restart'],['Repeated load evaluation',f'{sum(s["successes"] for s in B["scenarios"]):,} / {sum(s["volume"] for s in B["scenarios"]):,} successful issuances in 15 runs'],['Mean full issuance',f'{fmt(W["issuanceMs"]["mean"])} ms, including document publication'],['Mean employer verification',f'{fmt(W["verificationHttpMs"]["mean"])} ms; no blockchain transaction fee']],[205,302])
add('Scope: a real local smart-contract deployment on Ganache, with synthetic student records. These measurements do not represent a public blockchain or production service. Deliverables are the source project ZIP and this report. The video was omitted as explicitly requested.','SmallCustom')

# 2
page(2,'Problem, objectives and coverage')
add('Academic certificate verification needs reliable evidence of who issued an award, whether the presented content changed, and whether the award has since been withdrawn. A mutable database alone places those checks under one operator. A blockchain commitment provides a history that verifiers can compare with the certificate through a trusted registry and RPC connection. The attached assignment defines the required functions and evaluation metrics [1].')
h('Functional requirements')
table(['Requirement','Implemented behavior','Evidence'],[
['University registration','Self-registration; administrator approval before issuance','Tests 02, 04-08'],['Student registration','Wallet enrollment and salted identity commitment','Tests 03-05'],['Certificate issuance','Approved issuer; registered recipient; immutable unique ID/hash','Tests 07-11'],['Certificate verification','JSON upload, stored-record lookup, direct RPC CLI','Tests 12-19, 30; CLI'],['QR code generation','Registry-bound URL in SVG; printable certificate','Test 20; QR decode'],['Certificate revocation','Issuer-only, permanent, recorded reason hash','Tests 24-28'],['Administrator dashboard','Approval controls, counts and transaction event history','Test 23']],[116,278,113])
h('Performance and submission requirements')
table(['Required metric / deliverable','Where addressed'],[['Deployment cost; gas; transaction cost','Actual receipt arithmetic and operation table, p. 10'],['Issuance and verification latency','30 trials after 2 warmups, p. 11'],['Block confirmation time','Defined observation interval, pp. 9 and 11'],['Throughput and success rate','15 workload runs, p. 12'],['Scalability across multiple volumes','10 / 50 / 100 certificates; concurrency controlled, p. 12'],['Implementation, deployed contract and explanation','Architecture pp. 3-5; workflow p. 6; deployment p. 7'],['Report no more than 15 pages','This 14-page report; source and evidence in ZIP'],['Video','Excluded by explicit user instruction']],[221,286])
add('The goal is an explainable academic prototype, not a claim of accreditation, regulatory compliance, universal credential interoperability or production decentralization. Each required feature is linked to an implementation and reproducible evidence in docs/REQUIREMENTS_CHECKLIST.md.','SmallCustom')

# 3
page(3,'System architecture')
story.append(architecture());story.append(Spacer(1,12))
add('<b>Figure 1.</b> Functional architecture of the delivered local DApp. The CLI can also query the registry through a separately chosen RPC, bypassing the application verifier and file store.','SmallCustom')
h('Responsibilities and data flow')
add('The browser provides registration, issuance, public verification, the certificate registry and administration. A selected demo account sends transactions through a restricted same-origin RPC proxy. An optional connected browser wallet can sign using its own account. Visibility of a button is only a convenience: Solidity enforces all write permissions.')
add('The Express service delivers the browser files, generates QR SVG images, publishes committed JSON documents, and assembles read-only dashboard responses. The local EVM runs the actual compiled contract. Every successful write has a mined receipt and an emitted event. The complete data directory persists across restarts.')
h('Trust boundaries')
add('The contract is authoritative for issuer approval, recipient enrollment, immutable content commitments and revocation. The off-chain store improves document availability but cannot replace the hash in the contract. Publication verifies the commitment before accepting a file; an altered stored copy also fails verification.')
add('A university is trusted to make truthful academic assertions. The administrator is trusted to approve legitimate institutions. A verifier must select the intended chain and contract through a trusted channel. The local RPC and web verifier remain operated by one host; independent RPC verification is available, but this demo does not implement a distributed consensus network.')
callout('Why keep documents off chain?','A fixed-size hash avoids storing a full certificate in contract storage. It does not encrypt the document or recover lost content. Availability, personal-data protection and institutional identity verification remain separate concerns.')

# 4
page(4,'Smart contract design')
add('AcademicRegistry.sol uses Solidity 0.8.30 with optimizer runs = 200 and Shanghai EVM output. The constructor reserves an immutable administrator address. The contract has no token transfers, payments, external calls, proxy upgrades, or certificate editing function.')
table(['State / function','Purpose and authorization'],[['universities[address]','Name, registered flag and approved flag. The name is fixed at registration.'],['students[address]','Nonzero salted identity commitment; one registration per wallet.'],['certificates[id]','Document hash, issuer, student, issuedAt, revokedAt and reason hash.'],['registerUniversity(name)','Self-service registration; pending approval; cannot overlap student/admin roles.'],['approveUniversity(address, bool)','Administrator only; grant or suspend issuing authority.'],['registerStudent(commitment)','Self-service; nonzero commitment and unregistered non-admin address.'],['issue(id, hash, student)','Approved university only; registered student; nonzero unused ID/hash.'],['revoke(id, reasonHash)','Original issuer only; known unrevoked certificate; nonzero reason.'],['verify(id, hash)','Read-only code: unknown, valid, altered, revoked or issuer suspended.']],[166,341])
h('Lifecycle rules')
add('<b>University:</b> unregistered → pending → approved ↔ suspended. Suspension prevents new certificates. It also flags existing unrevoked certificates until the issuer is approved again.')
add('<b>Certificate:</b> absent → issued → revoked. Revocation is irreversible. A suspended issuer may still revoke its own incorrect certificate. Neither the administrator nor another university can revoke or overwrite the original issuer\'s record.')
h('Invariants and auditability')
add('An existing certificate ID never receives a replacement document hash. The issuer and recipient are fixed at issuance. Revoked certificates remain present, and later university reapproval does not undo revocation. Registration, approval, issuance and revocation emit indexed events for inspection by address or certificate ID.')
add('The on-chain verify view checks the supplied hash and chain state; off-chain document verification additionally validates the schema, registry domain, issuer/recipient fields and registered university name. Universities still control the factual award data they commit.','SmallCustom')

# 5
page(5,'Certificate integrity protocol')
add('The digital credential is a strict JSON object with exactly 12 fields. This restricted profile makes canonicalization simple to reproduce in both the browser and Node.js. Unknown fields, arrays, floating-point values, malformed addresses and invalid dates are rejected.')
table(['Field group','Representation / role'],[['schema','Fixed string CertiLedger/1'],['chainId; registry','Positive safe integer and checksum contract address; domain binding'],['certificateId','Random nonzero 32-byte ID, lowercase 0x hexadecimal'],['university; universityName','Checksum issuer address and bounded institutional name'],['student; studentName; studentNumber','Checksum recipient and bounded readable identity fields'],['qualification; classification; issuedOn','Award text, grade/classification and real YYYY-MM-DD date']],[185,322])
h('Canonical hash')
story.append(Preformatted('validate(document)\nkeys = sort(exactSchemaKeys)\ncanonical = JSON.stringify(documentWithKeysInThatOrder)\ndigest = SHA256(UTF8(canonical))',styles['CodeCustom']))
add('Object-key order and whitespace outside strings do not affect the digest. Every field value is committed: altering the qualification, name, student number, issuer, address or date changes the hash. Spaces, letter case and Unicode normalization inside text are preserved exactly. This application-specific profile does not claim full RFC 8785 or W3C Verifiable Credential compatibility.')
h('Issuance, verification and replay resistance')
add('The university submits the certificate ID, digest and registered student wallet. Solidity accepts the write only from an approved issuer. The browser then publishes the exact original document. Including the chain ID, registry address, certificate ID, issuer and student in the hash binds the document to its intended context; the verifier also compares those values with trusted configuration and the on-chain record.')
add('Verification selects one block number and reads both certificate and university state at that block. It validates content equality and issuer identity, checks permanent revocation, and checks current approval. The result names the block used, so it is a snapshot rather than a promise that revocation cannot happen later.')
callout('Tampering is detected, not physically prevented','A person can edit a downloaded JSON or copy a QR onto forged paper. The system detects changed digital fields when that file is verified. For paper, compare the printed details with the original retrieved through a trusted verifier.')

# 6
page(6,'User workflows and local operation')
h('1. Install and launch')
add('Extract the ZIP and open the folder containing package.json. Install Node.js 24 LTS, then run the following commands in Command Prompt or a terminal. The startup command compiles and deploys the contract automatically and reuses saved data on later runs.')
story.append(Preformatted('npm ci\nnpm start\n# Open http://localhost:3000',styles['CodeCustom']))
h('2. Register and issue')
add('Select University A, open Registration and enter a fictional institution name. Select Student A and register its student number. Select Administrator and approve the university. Switch back to University A, enter the registered student wallet and award details, and issue. Keep the automatically downloaded JSON; it is saved before sending the transaction so it can recover an interrupted publication.')
h('3. Verify, print and revoke')
add('Select Employer / public verifier and upload the certificate JSON. No wallet or transaction is needed. The result shows authenticity, student, award, issuer and the block checked. The registry provides JSON download and a printable certificate with QR. A copied JSON with an edited qualification fails. The issuing university can permanently revoke the original; subsequent checks return REVOKED.')
h('4. Reproduce a fast live demonstration')
story.append(Preformatted('# In a second terminal while npm start is running:\nnpm run demo\nnpm run verify -- data/demo/certificate-valid.json',styles['CodeCustom']))
add('The demo command creates live valid and altered files under data/demo. Historical files under evidence were produced on isolated evaluation chains and are not registered in a newly started application. The direct-RPC CLI can verify the original without depending on the delivery API.')
h('QR meaning and operational limits')
add('The QR URL includes the certificate ID, chain ID and registry address. It retrieves and verifies the stored original; it does not cryptographically authenticate the surrounding paper. The default URL uses the project computer\'s localhost. A different phone cannot reach that address; it needs a separately deployed, trusted HTTPS verifier. QR generation and software decoding were tested, while browser printing and camera scanning remain manual checks.')
add('The README includes role-by-role instructions, Windows lock/permission troubleshooting, optional wallet settings, data backup guidance and all evaluation commands. No Docker or separate database installation is required.','SmallCustom')

# 7
page(7,'Implementation and deployment')
table(['Layer','Pinned technology','Reason'],[['Runtime','Node.js 24.19.0 evaluated; >=22 supported','Cross-platform start and test commands'],['Contract / compiler','Solidity 0.8.30; solc 0.8.30','Explicit authorization and repeatable ABI/bytecode'],['Local chain','Ganache 7.9.2; chain 31337','Actual local EVM with persistent state'],['Blockchain client','ethers 6.15.0','Contract calls, transactions and hashing [4]'],['HTTP / interface','Express 5.1.0; HTML/CSS/ES modules','Minimal app setup and read-only verification'],['QR output','qrcode 1.5.4; level M; margin 4','Generated SVG and PNG evidence [5]']],[104,204,199])
h('Actual evaluated deployment')
table(['Receipt field','Observed value'],[['Registry',DEP['address']],['Deployment transaction',DEP['transactionHash']],['Chain / block',f'{DEP["chainId"]} / {DEP["blockNumber"]}'],['Compiler',DEP['compiler']],['Source SHA-256',DEP['sourceHash']]],[127,380])
add('The contract was deployed to an actual local Ganache EVM and executed through JSON-RPC. The deployment record contains address, transaction hash, block, gas, price and fee; it is retained in benchmark-results.json. It is not a public testnet/mainnet deployment or evidence of independent validators. The optional deploy script can deploy the contract to another RPC, but the supplied app is configured for local operation.')
h('Persistence and API boundaries')
add('The application stores chain state, deployment metadata and exact certificate JSON under data/. It checks the saved source fingerprint and the deployed administrator before reusing a contract. A restart test closes both chain and HTTP server, reopens the same data and verifies the previously issued certificate.')
add('The publication endpoint accepts only an already-committed matching document. Verification and QR endpoints are public reads. The HTTP server binds to loopback, checks Host/Origin and limits JSON size; its RPC proxy exposes only required methods. These measures support a local demo and do not turn unlocked deterministic Ganache accounts into a production authentication system.')

# 8
page(8,'Security evaluation and test evidence')
add(f'The final automated suite passed {T["passed"]}/{T["passed"]} tests with zero failures. It uses live contracts and HTTP requests, including unauthorized operations and complete persistence restart. Separate integration checks ran the live demo and direct-RPC CLI: the original returned VALID and the altered file returned ALTERED. Raw test names, assertions and results are included in the ZIP.')
table(['Threat / failure','Implemented control','Observed check'],[['Unauthorized issuer','Only approved university msg.sender may issue','Rejected before approval; accepted after'],['Registration or approval abuse','Single role; reserved admin; admin-only approval','Duplicate/cross-role/unauthorized calls rejected'],['Content overwrite','Unique nonzero ID; no update method','Duplicate issuance leaves original hash unchanged'],['Altered certificate','Strict schema and full canonical hash','Changed award/identity/date fails'],['Registry replay / issuer impersonation','Trusted chain/contract; issuer, student and name binding','Wrong context and conflicting issuer name fail'],['Unauthorized / repeated revocation','Original issuer only; one-way state','Other actors and duplicate revokes rejected'],['Issuer suspension','Approval read at verification block','New issues blocked; existing awards flagged'],['Delivery interruption','Saved original; hash-checked republication','Missing delivery copy recovered without reissuing'],['Local web boundary abuse','Host/Origin checks; limits; CSP; RPC allowlist','Foreign host/origin and management RPC rejected'],['Data loss on restart','Persistent chain and deployment/file directory','Issued credential remains verifiable after reopen']],[118,207,182])
h('Remaining trust and privacy risks')
add('Hash equality proves consistency with a committed document; it cannot prove the award is true. Compromised approved keys can issue false claims. Administrative mistakes, compromised RPC responses, lost originals, unauthorized access to the host and dishonest institutions remain outside the cryptographic guarantee. Solidity security guidance emphasizes both access restrictions and the public visibility of blockchain data [3].')
add('Only salted student commitments are directly registered, but wallet relationships and issuer names are public, and delivery JSON contains readable personal details. The prototype uses synthetic records. It has no independent security audit, access-controlled document delivery, institutional SSO, emergency governance, or confidential proof mechanism. Browser interaction and external-wallet integration were not automated in this evaluation.','SmallCustom')

# 9
page(9,'Performance evaluation methodology')
add('All numbers in this report come from executing the supplied scripts. Each scalability repetition uses a fresh chain and registry. Setup transactions are recorded for gas accounting but excluded from the timed load interval. This separates transaction load from user enrollment and avoids reusing prior certificate IDs.')
table(['Parameter','Configuration'],[['Host',f'{ENV["cpu"]}; {ENV["logicalCpus"]} logical CPUs reported'],['Memory / platform',f'{fmt(ENV["memoryGiB"])} GiB reported; {ENV["platform"]} {ENV["architecture"]}'],['Execution',f'Node {ENV["node"]}; Ganache JavaScript fallback; shared host'],['Chain',f'31337; Shanghai; {ENV["blockTimeSeconds"]:.2f} s configured mining interval'],['Gas price / confirmation','Fixed legacy 2 gwei; one mined receipt'],['Workflow experiment','2 warmups excluded, then 30 sequential full issuance/verification trials'],['Volume experiment','N = 10, 50, 100 at concurrency C = 4; 3 repetitions each'],['Concurrency experiment','C = 1, 4, 8 at N = 100; 3 repetitions each'],['Total load runs','15 unique runs; the N=100/C=4 runs serve both comparisons']],[152,355])
h('Metric definitions')
add('<b>Gas and fee:</b> use receipt.gasUsed and effective receipt.gasPrice. Fee (wei) = gasUsed × gasPrice; fee (ETH) = feeWei / 10<super>18</super>. Every raw receipt is checked against this equality. Gas measures execution work, while its currency cost also depends on the gas price [2].')
add('<b>Full issuance latency:</b> document construction/canonicalization/hash, transaction submission and first successful receipt, then confirmed HTTP publication. <b>Verification latency:</b> HTTP request through schema validation, hashing and consistent-block chain reads to response. Neither interval includes manual typing or wallet approval by a human.')
add('<b>Confirmation wait:</b> acknowledged transaction to first observed receipt; separate total transaction latency begins before submission. This is client-observed inclusion, not consensus finality. <b>TPS:</b> successful issuance receipts / elapsed load seconds. <b>Success rate:</b> successful receipts / attempted issuances × 100. Final ledger counts are cross-checked with receipt counts.')
add('The load test pre-hashes certificates and uses one sequential nonce stream per concurrent university. It excludes document delivery. Reported p95 uses the nearest-rank observation; graph error bars are sample standard deviations across three run-level TPS values. Small samples and shared-host scheduling limit generalization.','SmallCustom')

# 10
page(10,'Deployment, gas and transaction costs')
table(['Deployment metric','Measured value'],[['Gas used',f'{int(DEP["gasUsed"]):,}'],['Effective gas price',f'{int(DEP["gasPriceWei"]):,} wei = 2 gwei'],['Transaction fee',f'{int(DEP["feeWei"]):,} wei = {int(DEP["feeWei"])/1e18:.8f} ETH'],['Observed deployment latency',f'{fmt(DEP["latencyMs"])} ms']],[215,292])
h('Operation-level receipt measurements')
gas_rows=[]
for key,label in [('university-registration','University registration'),('student-registration','Student registration'),('approval','University approval'),('issuance','Issuance: measured workflow'),('load-issuance','Issuance: load trials'),('revocation','Certificate revocation')]:
    g=GAS[key];gas_rows.append([label,g['gasUsed']['n'],fmt(g['gasUsed']['mean'],1),f'{g["feeEth"]["mean"]:.9f}'])
table(['Operation','n','Mean gas','Mean fee (ETH)'],gas_rows,[210,35,110,152])
add('Read-only employer verification sends eth_call / state reads and creates no transaction, so its transaction fee is 0 ETH. This is not zero computational work: the verifier and RPC still execute code. If a contract invokes verification inside a transaction, that execution consumes gas. The interface does not charge a certificate payment.')
h('Interpretation')
add(f'At the configured 2 gwei price, a typical measured workflow issuance used about {fmt(GAS["issuance"]["gasUsed"]["mean"],0)} gas and cost {GAS["issuance"]["feeEth"]["mean"]:.9f} local ETH. Deployment is a larger one-time cost because bytecode and initial state must be created. These balances are synthetic; no real ETH was spent.')
add('The first entry in an array/counter can cost more than later entries because zero-to-nonzero storage changes differ from updates to nonzero slots. Calldata byte patterns also cause small variation. University-name length affects registration gas, so these samples use consistent synthetic names. Only one revocation was included in the cost sample; it is an observed receipt, not a stable population estimate.')
callout('Separate gas from market cost','For a fixed operation, gas units can stay similar while its ETH fee changes with the effective gas price. Multiplying these local fees into a fiat estimate would require an external price and a relevant public-network fee scenario. Neither is assumed here.')

# 11
page(11,'Issuance, verification and confirmation latency')
story.append(Image(str(TMP/'latency.png'),width=WIDTH,height=194));story.append(Spacer(1,8))
add('<b>Figure 2.</b> Mean and 95th-percentile latency from 30 sequential measured trials after two warmups. The intervals overlap; confirmation is part of the transaction, which is part of full issuance.','SmallCustom')
latency_rows=[]
for key,label in [('issuanceMs','Full issuance + publication'),('transactionMs','Submission to receipt'),('confirmationWaitMs','Acknowledgment to receipt'),('verificationHttpMs','Public HTTP verification'),('hashMs','Document preparation + hashing'),('qrMs','QR SVG generation')]:
    s=W[key];latency_rows.append([label,fmt(s['mean']),fmt(s['median']),fmt(s['p95']),f'{fmt(s["min"])}-{fmt(s["max"])}'])
table(['Measured interval','Mean ms','Median ms','p95 ms','Range ms'],latency_rows,[181,71,76,69,110])
h('Interpretation and limits')
add(f'Mean end-to-end issuance was {fmt(W["issuanceMs"]["mean"])} ms. Its transaction-and-receipt component averaged {fmt(W["transactionMs"]["mean"])} ms; publication adds an exact-hash check and a local file write. Verification averaged {fmt(W["verificationHttpMs"]["mean"])} ms because it performs read calls without waiting for a new mined transaction.')
add(f'The mean post-acknowledgment confirmation wait was {fmt(W["confirmationWaitMs"]["mean"])} ms. The configured block interval is 250 ms, but measured client timing includes when submission arrives within that interval, RPC acknowledgment and receipt polling. It is therefore neither a fixed 250 ms nor Ethereum finality.')
add('No WAN delay, user confirmation time, competing validator traffic or public-network fee competition was simulated. Hardware scheduling, input length and RPC batching can change results. Median uses the middle ordered sample selected by the benchmark; p95 with only 30 observations is descriptive and has substantial uncertainty.','SmallCustom')

# 12
page(12,'Scalability, throughput and success rate')
story.append(Image(str(TMP/'scalability.png'),width=WIDTH,height=201));story.append(Spacer(1,7))
add('<b>Figure 3.</b> Three fresh-chain repetitions per condition. Left varies volume at fixed concurrency. Right varies concurrency at fixed volume. Error bars show sample standard deviation, not confidence intervals.','SmallCustom')
scale_rows=[]
for n,c in [(10,4),(50,4),(100,4),(100,1),(100,8)]:
    runs=group(n,c);scale_rows.append([n,c,' / '.join(f'{r["tps"]:.2f}' for r in runs),fmt(mean(n,c)),f'{sum(r["successes"] for r in runs)}/{n*3}',f'{statistics.mean(r["successRate"] for r in runs):.0f}%'])
table(['N','C','TPS: runs 1 / 2 / 3','Mean TPS','Successes','Rate'],scale_rows,[34,34,176,81,100,82])
h('What the experiments show')
add(f'At four workers, mean throughput was {fmt(mean(10,4))}, {fmt(mean(50,4))} and {fmt(mean(100,4))} TPS for 10, 50 and 100 certificates respectively. Fixed run startup costs and local scheduling affect small workloads. This limited range supports observed workload completion; it does not establish unlimited capacity or constant performance at millions of records.')
add(f'At 100 certificates, increasing concurrency from one to four to eight workers changed mean throughput from {fmt(mean(100,1))} to {fmt(mean(100,4))} to {fmt(mean(100,8))} TPS. Concurrent requests better fill mining intervals, but the runtime still shares a single local execution environment, so speedup is not guaranteed to remain linear.')
add(f'All {sum(s["volume"] for s in B["scenarios"]):,} load attempts succeeded. Deliberately rejected authorization/tamper cases belong to the separate correctness tests and are not counted as load failures. The benchmark cross-checks successful receipts against the contract\'s certificate count for every run. Raw per-run duration, latency, TPS and success rate are included in scalability.csv.')
add('These are transaction-only throughput results: hashing and document publication are outside the load timer. End-to-end user experience is represented separately by the full issuance timings on p. 11. Dashboard log scanning and real multi-host storage/network scalability were not benchmarked.','SmallCustom')

# 13
page(13,'Demonstration evidence and reproducibility')
add('The execution trace registers and approves a synthetic university, registers a student, issues a certificate, verifies the original, verifies an altered qualification, and revokes the original. Each result below came from the running contract and verifier, not a mocked status.')
table(['Check','Actual result','Meaning'],[['Original issued JSON',D['before']['status'],'Digest and issuer match; unrevoked and approved'],['Edited qualification',D['tampered']['status'],'Presented content differs from the committed digest'],['Original after issuer revocation',D['after']['status'],'Correct original is withdrawn; record remains present']],[191,86,230])
left=[p('QR verification evidence','H2Custom'),p('The generated PNG was decoded with OpenCV QRCodeDetector. Its complete decoded URL matched the expected certificate ID, chain and registry. SVG output is also supplied. This checks the QR payload and image, not phone-camera or cross-device access.'),p('The certificate belongs to an isolated historical evaluation chain. Run npm run demo after npm start to create a certificate that can be verified in your own local instance.','SmallCustom')]
qr=Image(str(E/'sample-qr.png'),width=174,height=174)
block=Table([[left,qr]],colWidths=[321,186]);block.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),7)]));story.append(block);story.append(Spacer(1,8))
h('Reproduce the supplied evidence')
story.append(Preformatted('npm test                 # contract/API/security/restart tests\nnpm run evaluate         # tests + CLI + repeated benchmarks\n# Results: evidence/*.json, *.csv and *.log',styles['CodeCustom']))
add('A clean npm ci was executed in a separate directory with no node_modules; it installed 451 packages successfully on Linux. The normalized lock avoids treating Ganache\'s bundled macOS-only fsevents watcher as a mandatory cross-platform dependency. Windows itself was not executed here, and browser interaction, printing and external-wallet use remain local manual checks.')
add('Reproducibility files include source, ABI/bytecode, exact dependency versions, readable test logs, per-transaction receipts, per-run scalability CSV, benchmark environment metadata, QR decode evidence and direct-RPC CLI results. The report generator reads those files; rerunning a benchmark updates evidence but the PDF must be regenerated separately.')

# 14
page(14,'Discussion, future work and references')
h('Challenges and design decisions')
add('The implementation separates immutable certification from recoverable document delivery. A transaction may succeed while publication fails, so the browser downloads the exact JSON first and the recovery endpoint verifies it before saving. Verification binds both reads to a single block to avoid mixing lifecycle states. The dependency lock also required an explicit optional-platform correction for reproducible installation.')
add('The main limits are trust and deployment scope: one administrator approves institutions, approved issuers can make false factual claims, readable off-chain documents need privacy controls, and a single local node does not provide independent consensus. QR verification is a locator plus a ledger check, so paper details still need comparison. Small local measurements do not predict production capacity or finality.')
h('Prioritized improvements')
add('<b>First:</b> deploy on an independently operated consortium or test network; authenticate institutions through a vetted issuer directory; use protected institutional keys and a multisignature administrator. Define trusted RPC sources, confirmation depth and reorganization handling.')
add('<b>Next:</b> add consent-based document access, resilient replicated delivery, data-retention rules, an indexed event service and recovery/rotation governance. Adopt an interoperable credential standard with selective disclosure if requirements justify it. Extend evaluation to WAN conditions, multiple hosts, larger volumes, malicious workloads and browser/device accessibility.')
h('Conclusion and submission statement')
add(f'CertiLedger implements every minimum functional requirement and measures every requested performance category. The delivered evidence includes {T["passed"]} passing automated tests and {sum(s["successes"] for s in B["scenarios"]):,} successful load issuances. The defensible result is an explainable, reproducible local academic prototype with explicit security and deployment limits. The report is 14 pages; the video is omitted at the user\'s request.')
h('References')
refs=[
'[1] MSc Blockchain Course. Assignment 2: Blockchain-Based Academic Certificate Verification System. Supplied ass-2.pdf, pp. 1-2.',
'[2] Ethereum Foundation. Gas and fees. https://ethereum.org/developers/docs/gas/ (accessed 3 September 2026).',
'[3] Solidity documentation. Security Considerations. https://docs.soliditylang.org/en/latest/security-considerations.html (accessed 3 September 2026). Implementation pinned to Solidity 0.8.30.',
'[4] ethers documentation, version 6. Contracts. https://docs.ethers.org/v6/api/contract/ (accessed 3 September 2026).',
'[5] node-qrcode. QR code generation library and API. https://github.com/soldair/node-qrcode (accessed 3 September 2026).',
'[6] Project evidence: benchmark-results.json; transactions.csv; scalability.csv; tests.log; test-summary.json; qr-validation.json; cli-integration.json. Generated by the submitted source.'
]
for ref in refs:add(html.escape(ref),'SmallCustom')

def furniture(canvas,doc):
    canvas.saveState();canvas.setStrokeColor(LINE);canvas.line(44,38,551,38);canvas.setFont('DejaVu',7);canvas.setFillColor(GRAY);canvas.drawString(44,25,'CertiLedger | MSc Blockchain | Assignment 2');canvas.drawRightString(551,25,f'{doc.page} / 14');
    canvas.setFillColor(BLUE);canvas.rect(44,804,34,3,fill=1,stroke=0);canvas.restoreState()
OUT.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(OUT),pagesize=(595,842),rightMargin=44,leftMargin=44,topMargin=49,bottomMargin=49,title='Assignment 2 - Blockchain-Based Academic Certificate Verification System',author='Student submission - complete identity fields',subject='Implementation, security and measured blockchain performance')
doc.build(story,onFirstPage=furniture,onLaterPages=furniture)
print(OUT)
