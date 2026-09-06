#!/usr/bin/env python3
"""
LitSphere Pre-Defense Presentation Generator (White Theme PPTX)
Department of Computer Science and Engineering
Jashore University of Science and Technology (JUST)
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# --- Color Palette (White Theme / Academic Navy & Gold) ---
NAVY = RGBColor(22, 50, 91)       # #16325B Primary Header / Title
DARK_NAVY = RGBColor(15, 34, 64)  # #0F2240
GOLD = RGBColor(198, 146, 20)     # #C69214 Academic Gold
LIGHT_GOLD = RGBColor(250, 243, 224) # #FAF3E0
WHITE = RGBColor(255, 255, 255)
CARD_BG = RGBColor(248, 250, 252) # #F8FAFC
CARD_BORDER = RGBColor(226, 232, 240) # #E2E8F0
DARK_TEXT = RGBColor(30, 41, 59)  # #1E293B
SUB_TEXT = RGBColor(100, 116, 139) # #64748B
LIGHT_BG = RGBColor(241, 245, 249)

# Accents
GREEN = RGBColor(22, 101, 52)
AMBER = RGBColor(180, 83, 9)
BLUE = RGBColor(29, 78, 216)
RED = RGBColor(185, 28, 28)
TEAL = RGBColor(15, 118, 110)
PURPLE = RGBColor(109, 40, 217)

# Title Slide Reference Brand Colors
TITLE_ORANGE = RGBColor(245, 150, 33)   # #F59621 Reference Orange Bar
TITLE_GREEN = RGBColor(18, 118, 64)     # #127640 Reference Green Title
DIVIDER_PURPLE = RGBColor(94, 24, 235)  # #5E18EB Reference Purple Center Line

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

FIGURES_DIR = os.path.join(os.path.dirname(__file__), "..", "Presentation", "figures")
OUTPUT_PPTX = os.path.join(os.path.dirname(__file__), "..", "Presentation", "LitSphere_PreDefense.pptx")

prs = Presentation()
prs.slide_width = SLIDE_WIDTH
prs.slide_height = SLIDE_HEIGHT
blank_slide_layout = prs.slide_layouts[6]

def set_slide_background_white(slide):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = WHITE

def add_header(slide, title_text, slide_num, total_slides=28):
    set_slide_background_white(slide)
    
    # Title Text (Crisp Dark Academic) - Caption : 36 in Times New Roman
    tx_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.18), Inches(11.733), Inches(0.68))
    tf = tx_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = title_text
    p.font.name = "Times New Roman"
    p.font.size = Pt(36)
    p.font.bold = True
    p.font.color.rgb = DARK_TEXT

    # Clean Subtle Hairline Divider moved up directly beneath caption
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(0.86), Inches(11.733), Inches(0.015))
    line.fill.solid()
    line.fill.fore_color.rgb = RGBColor(220, 225, 230)
    line.line.fill.background()

    # Slide Number Only (Bottom Right)
    num_box = slide.shapes.add_textbox(Inches(11.0), Inches(7.05), Inches(1.5), Inches(0.35))
    p_num = num_box.text_frame.paragraphs[0]
    p_num.text = f"{slide_num} / {total_slides}"
    p_num.font.name = "Times New Roman"
    p_num.font.size = Pt(14)
    p_num.font.color.rgb = DARK_TEXT
    p_num.alignment = PP_ALIGN.RIGHT

def add_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER, stripe_color=None):
    # Professional academic format: cards and container boxes removed
    return None

# ==============================================================================
# SLIDE 1: Title Slide (White Theme matching Reference Design)
# ==============================================================================
s1 = prs.slides.add_slide(blank_slide_layout)
set_slide_background_white(s1)

# Top Logo (JUST Seal)
logo_path = os.path.join(FIGURES_DIR, "just_logo.png")
if os.path.exists(logo_path):
    logo_w = Inches(1.18)
    logo_h = Inches(1.34)
    logo_left = (SLIDE_WIDTH - logo_w) / 2
    logo_top = Inches(0.40)
    s1.shapes.add_picture(logo_path, logo_left, logo_top, width=logo_w, height=logo_h)

# University & Dept Header Text
tx_uni = s1.shapes.add_textbox(Inches(1.0), Inches(1.70), Inches(11.333), Inches(0.95))
tf_uni = tx_uni.text_frame
tf_uni.word_wrap = True
p_u1 = tf_uni.paragraphs[0]
p_u1.text = "Jashore University of Science and Technology"
p_u1.font.size = Pt(17)
p_u1.font.bold = False
p_u1.font.color.rgb = DARK_TEXT
p_u1.alignment = PP_ALIGN.CENTER

p_u2 = tf_uni.add_paragraph()
p_u2.text = "Computer Science and Engineering"
p_u2.font.size = Pt(14)
p_u2.font.color.rgb = DARK_TEXT
p_u2.alignment = PP_ALIGN.CENTER

# Top Orange Divider Bar
bar1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.78), Inches(11.733), Inches(0.025))
bar1.fill.solid()
bar1.fill.fore_color.rgb = TITLE_ORANGE
bar1.line.fill.background()

# Title and Subtitle Box (Bold Green, Center Aligned)
tx_title = s1.shapes.add_textbox(Inches(0.8), Inches(2.90), Inches(11.733), Inches(1.20))
tf_title = tx_title.text_frame
tf_title.word_wrap = True
p_title = tf_title.paragraphs[0]
p_title.text = "LitSphere"
p_title.font.size = Pt(28)
p_title.font.bold = True
p_title.font.color.rgb = TITLE_GREEN
p_title.alignment = PP_ALIGN.CENTER

p_sub = tf_title.add_paragraph()
p_sub.text = "A Collaborative Systematic Literature Review, Benchmark, and Research Synthesis Platform"
p_sub.font.size = Pt(13.5)
p_sub.font.bold = True
p_sub.font.color.rgb = TITLE_GREEN
p_sub.alignment = PP_ALIGN.CENTER

# Bottom Orange Divider Bar
bar2 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(4.25), Inches(11.733), Inches(0.025))
bar2.fill.solid()
bar2.fill.fore_color.rgb = TITLE_ORANGE
bar2.line.fill.background()

# Central Vertical Purple Divider Line
v_divider = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(6.645), Inches(4.55), Inches(0.045), Inches(2.25))
v_divider.fill.solid()
v_divider.fill.fore_color.rgb = DIVIDER_PURPLE
v_divider.line.fill.background()

# Presenter Block (Right Aligned to the left of the purple divider)
tx_pres = s1.shapes.add_textbox(Inches(0.8), Inches(4.50), Inches(5.5), Inches(2.3))
tf_pres = tx_pres.text_frame
tf_pres.word_wrap = True

pres_lines = [
    ("Presenter:", True, Pt(13)),
    ("Md Mostafa Kamal", False, Pt(13)),
    ("Student Id: 200108", False, Pt(13)),
    ("Dept. of Computer Science and Engineering(CSE)", False, Pt(12)),
    ("Jashore University of Science and Technology", False, Pt(12))
]
for i, (line_txt, is_bold, sz) in enumerate(pres_lines):
    p = tf_pres.paragraphs[0] if i == 0 else tf_pres.add_paragraph()
    p.text = line_txt
    p.font.size = sz
    p.font.bold = is_bold
    p.font.color.rgb = DARK_TEXT
    p.alignment = PP_ALIGN.RIGHT

# Supervisor Block (Left Aligned to the right of the purple divider)
tx_sup = s1.shapes.add_textbox(Inches(7.0), Inches(4.50), Inches(5.5), Inches(2.3))
tf_sup = tx_sup.text_frame
tf_sup.word_wrap = True

sup_lines = [
    ("Supervisor:", True, Pt(13)),
    ("Dr. Mohammad Nowsin Amin Sheikh", False, Pt(13)),
    ("Assistant Professor", False, Pt(13)),
    ("B.Sc (Engg.), M.Sc (Engg.), PhD", False, Pt(12)),
    ("Dept. of Computer Science and Engineering (CSE)", False, Pt(12)),
    ("Jashore University of Science and Technology", False, Pt(12))
]
for i, (line_txt, is_bold, sz) in enumerate(sup_lines):
    p = tf_sup.paragraphs[0] if i == 0 else tf_sup.add_paragraph()
    p.text = line_txt
    p.font.size = sz
    p.font.bold = is_bold
    p.font.color.rgb = DARK_TEXT
    p.alignment = PP_ALIGN.LEFT

# Slide 1 Page Counter at bottom right
tx_cnt = s1.shapes.add_textbox(Inches(11.5), Inches(7.05), Inches(1.3), Inches(0.35))
p_cnt = tx_cnt.text_frame.paragraphs[0]
p_cnt.text = "1 / 28"
p_cnt.font.name = "Times New Roman"
p_cnt.font.size = Pt(14)
p_cnt.font.color.rgb = DARK_TEXT
p_cnt.alignment = PP_ALIGN.RIGHT

# ==============================================================================
# SLIDE 2: Introduction & Research Motivation
# ==============================================================================
s2 = prs.slides.add_slide(blank_slide_layout)
add_header(s2, "Introduction & Research Motivation", 2)

intro_cards = [
    (Inches(0.8), Inches(1.4), AMBER, "CHALLENGE 01", "Scientific Literature Explosion",
     "Over 1.5 million peer-reviewed papers are published annually. Researchers face severe cognitive overload attempting to manually track, read, extract, and synthesize evidence across hundreds of PDF manuscripts."),
    (Inches(6.8), Inches(1.4), RED, "CHALLENGE 02", "Fragmented Academic Toolchains",
     "Reviewers are forced to juggle disconnected applications: Zotero for reference storage, Excel for data tables, and Word/Notepad for notes. This disjunction causes lost citations and version discrepancy."),
    (Inches(0.8), Inches(4.1), TEAL, "LIMITATION 03", "Absence of Coordinate Traceability",
     "Conventional spreadsheets store extracted claims with zero link to source text. Verifying a recorded benchmark requires re-reading multi-page papers from scratch due to missing bounding-box coordinates."),
    (Inches(6.8), Inches(4.1), GREEN, "THE SOLUTION", "LitSphere Centralized Synthesis Platform",
     "A unified, collaborative platform integrating split-screen PDF reading, coordinate-accurate claim anchoring, live synthesis matrix grids, and 1-click publication-ready LaTeX table generation.")
]

for left, top, color, tag, title, desc in intro_cards:
    top_pos = Inches(1.15) if "01" in tag or "02" in tag else Inches(4.10)
    tb = s2.shapes.add_textbox(left, top_pos, Inches(5.75), Inches(2.7))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.name = "Times New Roman"
    p1.font.size = Pt(14)  # sub text : 14
    p1.font.bold = True
    p1.font.color.rgb = color
    
    p2 = tf.add_paragraph()
    p2.text = title
    p2.font.name = "Times New Roman"
    p2.font.size = Pt(20)  # Header : 20
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.name = "Times New Roman"
    p3.font.size = Pt(16)  # Text : 16
    p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 3: Existing Systems & Limitations
# ==============================================================================
s3 = prs.slides.add_slide(blank_slide_layout)
add_header(s3, "Existing Systems & Limitations", 3)

sys_cards = [
    (Inches(0.8), Inches(1.15), NAVY, "REFERENCE MANAGERS", "Zotero, EndNote",
     "• Strengths: Reliable bibliographic indexing, citation metadata generation, and local PDF file storage.\n• Critical Gaps: Incapable of structured variable extraction; zero comparative matrix synthesis; no PRISMA consensus screening."),
    (Inches(6.8), Inches(1.15), AMBER, "MANUAL SPREADSHEETS", "Microsoft Excel, Google Sheets",
     "• Strengths: Flexible rows and columns; universally accessible tabular format.\n• Critical Gaps: Completely detached from PDF documents; severe data entry error rates; zero coordinate-anchored jump; high formatting overhead."),
    (Inches(0.8), Inches(4.10), PURPLE, "SPECIALIZED SLR TOOLS", "Rayyan, Covidence",
     "• Strengths: Structured title/abstract screening workflow for medical reviews.\n• Critical Gaps: Prohibitive subscription paywalls; rigid clinical focus; lack of interactive split-screen matrix extraction and benchmark clustering."),
    (Inches(6.8), Inches(4.10), RED, "NOTE-TAKING SYSTEMS", "Obsidian, Notion, LiquidText",
     "• Strengths: Freeform markdown notes and visual bi-directional document linking.\n• Critical Gaps: Lack structured systematic review protocols; no multi-reviewer dual-blind voting; no automated LaTeX publication export.")
]

for left, top, color, tag, title, desc in sys_cards:
    tb = s3.shapes.add_textbox(left, top, Inches(5.75), Inches(2.7))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.name = "Times New Roman"
    p1.font.size = Pt(14)  # sub text : 14
    p1.font.bold = True
    p1.font.color.rgb = color
    
    p2 = tf.add_paragraph()
    p2.text = title
    p2.font.name = "Times New Roman"
    p2.font.size = Pt(20)  # Header : 20
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.name = "Times New Roman"
    p3.font.size = Pt(16)  # Text : 16
    p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 4: LitSphere Proposed Architecture
# ==============================================================================
s4 = prs.slides.add_slide(blank_slide_layout)
add_header(s4, "LitSphere: Proposed System Architecture", 4)

# Center Top Pill
pill = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(3.2), Inches(1.15), Inches(6.9), Inches(0.48))
pill.fill.solid()
pill.fill.fore_color.rgb = NAVY
pill.line.fill.background()
p_p = pill.text_frame.paragraphs[0]
p_p.text = "CENTRALIZED COLLABORATIVE RESEARCH SYNTHESIS PLATFORM"
p_p.font.name = "Times New Roman"
p_p.font.size = Pt(14)  # sub text : 14
p_p.font.bold = True
p_p.font.color.rgb = WHITE
p_p.alignment = PP_ALIGN.CENTER

# Panel 1: Researcher Workspace
tb_w1 = s4.shapes.add_textbox(Inches(0.8), Inches(1.85), Inches(5.75), Inches(4.3))
tf_w1 = tb_w1.text_frame
tf_w1.word_wrap = True
tf_w1.margin_left = tf_w1.margin_right = tf_w1.margin_top = tf_w1.margin_bottom = 0
p = tf_w1.paragraphs[0]
p.text = "Researcher Workspace: Dual-Pane Reviewer"
p.font.name = "Times New Roman"
p.font.size = Pt(20)  # Header : 20
p.font.bold = True
p.font.color.rgb = NAVY

bullets1 = [
    ("Split-Screen PDF Reader: ", "Synchronous in-browser PDF viewing without requiring external desktop software."),
    ("Coordinate BBox Anchoring: ", "Highlights are permanently bound to exact geometric coordinates in the PDF."),
    ("Direct Variable Extraction: ", "Populate dataset, model, metrics, and limitations side-by-side with reading."),
    ("Search & Tag Filters: ", "Instant filtering by keyword, publication year, and domain taxonomy tags.")
]
for b_title, b_desc in bullets1:
    p = tf_w1.add_paragraph()
    p.text = "• " + b_title + b_desc
    p.font.name = "Times New Roman"
    p.font.size = Pt(16)  # Text : 16
    p.font.color.rgb = DARK_TEXT

# Panel 2: Synthesis Lead
tb_w2 = s4.shapes.add_textbox(Inches(6.8), Inches(1.85), Inches(5.75), Inches(4.3))
tf_w2 = tb_w2.text_frame
tf_w2.word_wrap = True
tf_w2.margin_left = tf_w2.margin_right = tf_w2.margin_top = tf_w2.margin_bottom = 0
p = tf_w2.paragraphs[0]
p.text = "Synthesis Lead: Master Matrix & Analytics"
p.font.name = "Times New Roman"
p.font.size = Pt(20)  # Header : 20
p.font.bold = True
p.font.color.rgb = DARK_NAVY

bullets2 = [
    ("Interactive Master Matrix: ", "Unified comparative grid aggregating extracted variables across all papers."),
    ("Dynamic Clustering: ", "Automated thematic grouping by methodology, problem type, and benchmarks."),
    ("Dual-Blind PRISMA Engine: ", "Independent reviewer screening and Cohen's Kappa agreement check."),
    ("1-Click Academic Export: ", "Direct output to LaTeX booktabs, formatted Excel (.xlsx), and BibTeX.")
]
for b_title, b_desc in bullets2:
    p = tf_w2.add_paragraph()
    p.text = "• " + b_title + b_desc
    p.font.name = "Times New Roman"
    p.font.size = Pt(16)  # Text : 16
    p.font.color.rgb = DARK_TEXT

# Bottom Impact Banner
tb_imp = s4.shapes.add_textbox(Inches(0.8), Inches(6.35), Inches(11.733), Inches(0.6))
p_imp = tb_imp.text_frame.paragraphs[0]
p_imp.text = "Core Impact: Eliminates the 80% administrative friction between reading academic literature and synthesizing publishable survey articles."
p_imp.font.name = "Times New Roman"
p_imp.font.size = Pt(16)  # Text : 16
p_imp.font.bold = True
p_imp.font.color.rgb = NAVY
p_imp.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 5: Feature Comparison Matrix (Native PPTX Table)
# ==============================================================================
s5 = prs.slides.add_slide(blank_slide_layout)
add_header(s5, "Feature Comparison: LitSphere vs Existing Tools", 5)

rows, cols = 9, 5
table_shape = s5.shapes.add_table(rows, cols, Inches(0.8), Inches(1.35), Inches(11.75), Inches(3.7))
table = table_shape.table
table.columns[0].width = Inches(3.95)
table.columns[1].width = Inches(1.95)
table.columns[2].width = Inches(1.95)
table.columns[3].width = Inches(1.95)
table.columns[4].width = Inches(1.95)

table_data = [
    ["Feature Dimension", "Zotero", "MS Excel / Sheets", "Rayyan / Covidence", "LitSphere (Proposed)"],
    ["In-Browser PDF Annotation", "✓ (Basic)", "✗", "✗", "✓ (Dual-Pane)"],
    ["Coordinate-Anchored Claims", "✗", "✗", "✗", "✓ (Exact BBox)"],
    ["Master Synthesis Matrix Grid", "✗", "✓ (Manual)", "✗", "✓ (Real-Time)"],
    ["Thematic Clustering", "✗", "✗", "✗", "✓ (Taxonomy)"],
    ["Dual-Blind PRISMA Screening", "✗", "✗", "✓ (Paid)", "✓ (Built-in)"],
    ["One-Click LaTeX booktabs Export", "✗", "✗", "✗", "✓ (Native)"],
    ["Local-First SQLite WAL Storage", "✓ (Proprietary)", "✗", "✗ (Cloud-only)", "✓ (Open ACID)"],
    ["Zero-Framework Sub-15ms Latency", "✗", "✗", "✗", "✓ (Optimized)"]
]

for r_idx, row in enumerate(table_data):
    for c_idx, val in enumerate(row):
        cell = table.cell(r_idx, c_idx)
        cell.text = val
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER if c_idx > 0 else PP_ALIGN.LEFT
        p.font.size = Pt(9)
        
        if r_idx == 0:
            cell.fill.solid()
            cell.fill.fore_color.rgb = NAVY
            p.font.bold = True
            p.font.color.rgb = GOLD if c_idx == 4 else WHITE
        else:
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if r_idx % 2 == 1 else CARD_BG
            if c_idx == 4:
                p.font.bold = True
                p.font.color.rgb = GREEN
            elif "✓" in val:
                p.font.color.rgb = DARK_TEXT
            elif "✗" in val:
                p.font.color.rgb = SUB_TEXT

# 3 Bottom highlight cards
cards_s6 = [
    (Inches(0.8), Inches(5.2), GREEN, "VERIFIABILITY", "100% Traceability", "Every extracted claim jumps directly to its original sentence in the PDF."),
    (Inches(4.8), Inches(5.2), NAVY, "STANDARDS", "PRISMA Compliance", "Structured screening, consensus voting, and automated exclusion reporting."),
    (Inches(8.8), Inches(5.2), GOLD, "EFFICIENCY", "Publication-Ready", "Direct generation of publication-grade LaTeX tables and BibTeX citation keys.")
]
for l, t, c, tag, tit, desc in cards_s6:
    tb = s5.shapes.add_textbox(l, t, Inches(3.75), Inches(1.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 6: Advanced Features: Part 1
# ==============================================================================
s6 = prs.slides.add_slide(blank_slide_layout)
add_header(s6, "Advanced Features: LitSphere Advantage (Part 1)", 6)

feat_cards1 = [
    (Inches(0.8), Inches(1.15), BLUE, "FEATURE MODULE 01", "Split-Screen Dual-Pane PDF Reviewer",
     "• Synchronous side-by-side layout: PDF reader docked alongside data extraction form.\n• Eliminates disruptive Alt-Tab switching between viewer and external spreadsheets.\n• Native PDF.js rendering with continuous vertical scrolling, zoom, and page jump."),
    (Inches(4.8), Inches(1.15), TEAL, "FEATURE MODULE 02", "Coordinate-Accurate Text Highlighting",
     "• Bounding box coordinates recorded in normalized [x, y, w, h] geometry.\n• Highlighting survives zoom, scaling, and responsive viewport adjustments.\n• Clicking an extracted matrix metric instantly navigates to the exact sentence."),
    (Inches(8.8), Inches(1.15), GOLD, "FEATURE MODULE 03", "Master Synthesis Matrix Grid",
     "• Real-time multi-dimensional comparison table across all ingested papers.\n• Inline editing with instant database persistence and audit trails.\n• Dynamic filtering by publication year, taxonomy tags, and performance metrics.")
]

for l, t, c, tag, tit, desc in feat_cards1:
    tb = s6.shapes.add_textbox(l, t, Inches(3.75), Inches(4.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# Bottom Engineering Box
tb = s6.shapes.add_textbox(Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.7))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Engineering Significance: Closed-loop verification cycle guarantees that every scientific claim in the synthesis matrix is verifiable in under 2 seconds."
p.font.size = Pt(16)
p.font.bold = True
p.font.color.rgb = NAVY
p.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 7: Advanced Features: Part 2
# ==============================================================================
s7 = prs.slides.add_slide(blank_slide_layout)
add_header(s7, "Advanced Features: LitSphere Advantage (Part 2)", 7)

feat_cards2 = [
    (Inches(0.8), Inches(1.15), GREEN, "FEATURE MODULE 04", "Dual-Blind PRISMA Screening",
     "• Independent voting protocol (Include / Exclude / Maybe) for peer reviewers.\n• Automated calculation of Cohen's Kappa (κ) inter-rater agreement score.\n• Arbitration interface for lead supervisors to resolve inclusion conflicts."),
    (Inches(4.8), Inches(1.15), AMBER, "FEATURE MODULE 05", "Zero-Framework High Performance",
     "• Built entirely using Vanilla ES6 JavaScript without bloated runtime frameworks.\n• Sub-15ms client interaction latency and ultra-fast DOM redraw speeds.\n• SQLite WAL mode enables concurrent reader execution with zero locking stalls."),
    (Inches(8.8), Inches(1.15), PURPLE, "FEATURE MODULE 06", "1-Click Academic Export Engine",
     "• Direct generation of IEEE/ACM compliant LaTeX booktabs code tables.\n• Formatted Excel export (.xlsx) for statistical meta-analysis.\n• Automatic BibTeX synchronization with sanitized citation keys and DOIs.")
]

for l, t, c, tag, tit, desc in feat_cards2:
    tb = s7.shapes.add_textbox(l, t, Inches(3.75), Inches(4.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# Bottom Box
tb = s7.shapes.add_textbox(Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.7))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Research Rigor: Conforms to international PRISMA guidelines, ensuring standard-compliant literature reviews."
p.font.size = Pt(16)
p.font.bold = True
p.font.color.rgb = NAVY
p.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 8: System Architecture & Tech Stack
# ==============================================================================
s8 = prs.slides.add_slide(blank_slide_layout)
add_header(s8, "System Architecture & Technology Stack", 8)

arch_cards = [
    (Inches(0.8), Inches(1.15), BLUE, "FRONTEND LAYER", "Native Web Architecture",
     "• HTML5 & CSS3: Modular design tokens, light theme, CSS grid and flexbox.\n• Vanilla ES6 JS: High performance, zero dependency bundle overhead.\n• PDF.js Library: Mozilla client-side PDF rendering engine.\n• Canvas Overlay: Coordinate highlight layer with precise BBox geometry."),
    (Inches(4.8), Inches(1.15), GREEN, "BACKEND LAYER", "Node.js REST API Service",
     "• Node.js & Express: Non-blocking asynchronous event-driven I/O.\n• Multer Engine: Streaming multipart PDF ingestion and validation.\n• JWT Security: Stateless authorization with bcrypt hash encryption.\n• Export Pipeline: Programmatic LaTeX table and XLSX synthesis."),
    (Inches(8.8), Inches(1.15), GOLD, "PERSISTENCE LAYER", "SQLite 3 Database Engine",
     "• SQLite 3 Engine: Embedded, zero-configuration relational database.\n• WAL Mode: Write-Ahead Logging for high-throughput concurrency.\n• ACID Guarantees: Transactional integrity on all matrix cell writes.\n• JSON Extension: Dynamic storage for extensible extraction schemas.")
]

for l, t, c, tag, tit, desc in arch_cards:
    tb = s8.shapes.add_textbox(l, t, Inches(3.75), Inches(4.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# Bottom Box
tb = s8.shapes.add_textbox(Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.7))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Design Philosophy: Local-first privacy, minimal deployment dependencies, maximum performance, and open standards compliance."
p.font.size = Pt(16)
p.font.bold = True
p.font.color.rgb = NAVY
p.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 9: Expected Functional Modules
# ==============================================================================
s9 = prs.slides.add_slide(blank_slide_layout)
add_header(s9, "Expected Functional Modules", 9)

mod_cards = [
    (Inches(0.8), Inches(1.15), NAVY, "FOR RESEARCHERS", "Extraction & Reading Tools",
     "• Drag-and-drop batch PDF ingestion.\n• Synchronized split-screen reader.\n• Text selection and BBox anchor.\n• BibTeX key and DOI lookup.\n• Contextual annotation notes.\n• Dynamic keyword cloud inspector."),
    (Inches(4.8), Inches(1.15), AMBER, "FOR PROJECT LEADS", "Synthesis & Governance",
     "• PRISMA screening protocol manager.\n• Extraction schema configuration.\n• Real-time master matrix dashboard.\n• Dynamic thematic clustering view.\n• Reviewer conflict resolution tools.\n• LaTeX booktabs & Excel export."),
    (Inches(8.8), Inches(1.15), TEAL, "SYSTEM-WIDE", "Core Infrastructure",
     "• Role-Based Access Control (RBAC).\n• Comprehensive action audit logging.\n• Local-first offline data resilience.\n• Automated database backups.\n• Responsive cross-browser layout.\n• REST API interface for extensions.")
]

for l, t, c, tag, tit, desc in mod_cards:
    tb = s9.shapes.add_textbox(l, t, Inches(3.75), Inches(5.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 10: 12-Month Project Timeline
# ==============================================================================
s10 = prs.slides.add_slide(blank_slide_layout)
add_header(s10, "12-Month Project Timeline (Gantt Overview)", 10)

# Timeline Area
t_left = Inches(0.8)
t_top = Inches(1.5)
t_width = Inches(11.733)
month_width = t_width / 12.0

# Month Headers
for m in range(1, 13):
    m_box = s10.shapes.add_textbox(t_left + (m - 1) * month_width, t_top, month_width, Inches(0.4))
    p = m_box.text_frame.paragraphs[0]
    p.text = f"M{m}"
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = SUB_TEXT
    p.alignment = PP_ALIGN.CENTER
    
    # Vertical grid line
    vl = s10.shapes.add_shape(MSO_SHAPE.RECTANGLE, t_left + (m - 1) * month_width, t_top + Inches(0.4), Pt(1), Inches(3.6))
    vl.fill.solid()
    vl.fill.fore_color.rgb = CARD_BORDER
    vl.line.fill.background()

# Current Status marker at Month 6
mark_x = t_left + 6 * month_width
mark_line = s10.shapes.add_shape(MSO_SHAPE.RECTANGLE, mark_x - Pt(1), t_top + Inches(0.3), Pt(2), Inches(3.7))
mark_line.fill.solid()
mark_line.fill.fore_color.rgb = GOLD
mark_line.line.fill.background()

mark_pill = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, mark_x - Inches(0.9), t_top - Inches(0.1), Inches(1.8), Inches(0.35))
mark_pill.fill.solid()
mark_pill.fill.fore_color.rgb = GOLD
mark_pill.line.fill.background()
p_mp = mark_pill.text_frame.paragraphs[0]
p_mp.text = "CURRENT STATUS (M6)"
p_mp.font.size = Pt(8)
p_mp.font.bold = True
p_mp.font.color.rgb = WHITE
p_mp.alignment = PP_ALIGN.CENTER

# 6 Phased Bars
gantt_tasks = [
    (0, 2, Inches(1.9), GREEN, "Phase 1: SRS (100% Complete)"),
    (2, 4, Inches(2.5), GREEN, "Phase 2: Design (100% Complete)"),
    (4, 6, Inches(3.1), GREEN, "Phase 3: Core UI (100% Complete)"),
    (6, 8, Inches(3.7), AMBER, "Phase 4: PRISMA (Active Target)"),
    (8, 10, Inches(4.3), NAVY, "Phase 5: ML & Clustering"),
    (10, 12, Inches(4.9), SUB_TEXT, "Phase 6: SUS & Final Defense")
]

for start_m, end_m, top_pos, bar_color, label in gantt_tasks:
    bar_x = t_left + start_m * month_width + Inches(0.05)
    bar_w = (end_m - start_m) * month_width - Inches(0.1)
    bar = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, bar_x, top_pos, bar_w, Inches(0.5))
    bar.fill.solid()
    bar.fill.fore_color.rgb = bar_color
    bar.line.fill.background()
    p = bar.text_frame.paragraphs[0]
    p.text = label
    p.font.size = Pt(8.5)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER

# Bottom Summary Cards
add_card(s10, Inches(0.8), Inches(5.8), Inches(5.75), Inches(0.9), CARD_BG, CARD_BORDER, GREEN)
tb = s10.shapes.add_textbox(Inches(1.0), Inches(5.85), Inches(5.35), Inches(0.8))
p = tb.text_frame.paragraphs[0]
p.text = "✓ Months 1–6 (Complete): Problem Analysis, Architecture, Reviewer & Matrix"
p.font.size = Pt(9.5)
p.font.bold = True
p.font.color.rgb = GREEN

add_card(s10, Inches(6.8), Inches(5.8), Inches(5.75), Inches(0.9), LIGHT_GOLD, None, GOLD)
tb = s10.shapes.add_textbox(Inches(7.0), Inches(5.85), Inches(5.35), Inches(0.8))
p = tb.text_frame.paragraphs[0]
p.text = "➢ Months 7–12 (Target): PRISMA Consensus, Clustering, User Studies & Defense"
p.font.size = Pt(9.5)
p.font.bold = True
p.font.color.rgb = NAVY

# ==============================================================================
# SLIDE 11: Development Phases & Targets
# ==============================================================================
s11 = prs.slides.add_slide(blank_slide_layout)
add_header(s11, "Development Phases & Milestone Targets", 11)

rows, cols = 7, 5
t12 = s11.shapes.add_table(rows, cols, Inches(0.8), Inches(1.35), Inches(11.75), Inches(3.2)).table
t12.columns[0].width = Inches(1.0)
t12.columns[1].width = Inches(3.75)
t12.columns[2].width = Inches(1.6)
t12.columns[3].width = Inches(1.8)
t12.columns[4].width = Inches(3.6)

t12_data = [
    ["Phase", "Focus Domain", "Timeline", "Status", "Key Deliverable"],
    ["1", "Problem Formulation & SRS", "M1–M2", "COMPLETED", "Formal requirements specification document"],
    ["2", "Architecture & Schema Design", "M3–M4", "COMPLETED", "Relational ERD, Use Case model, API contract"],
    ["3", "Core Reviewer & Matrix", "M5–M6", "COMPLETED", "Split-screen PDF reader, BBox highlight, matrix grid"],
    ["4", "Collaborative PRISMA Screening", "M7–M8", "NEXT FOCUS", "Dual-blind voting, Cohen's Kappa, conflict resolver"],
    ["5", "Synthesis Analytics & ML", "M9–M10", "PLANNED", "Dynamic thematic clustering, keyword frequency"],
    ["6", "Benchmarking & Defense", "M11–M12", "PLANNED", "SUS usability evaluation, thesis, final defense"]
]

for r_idx, row in enumerate(t12_data):
    for c_idx, val in enumerate(row):
        cell = t12.cell(r_idx, c_idx)
        cell.text = val
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER if c_idx in [0, 2, 3] else PP_ALIGN.LEFT
        p.font.size = Pt(9)
        
        if r_idx == 0:
            cell.fill.solid()
            cell.fill.fore_color.rgb = NAVY
            p.font.bold = True
            p.font.color.rgb = WHITE
        else:
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if r_idx % 2 == 1 else CARD_BG
            if c_idx == 3:
                p.font.bold = True
                p.font.color.rgb = GREEN if "COMPLETED" in val else (AMBER if "NEXT" in val else SUB_TEXT)

# Two Milestone Cards
tb1 = s11.shapes.add_textbox(Inches(0.8), Inches(4.8), Inches(5.75), Inches(2.0))
tf1 = tb1.text_frame
tf1.word_wrap = True
tf1.margin_left = tf1.margin_right = tf1.margin_top = tf1.margin_bottom = 0
p1 = tf1.paragraphs[0]
p1.text = "MILESTONE 1: CURRENT STATUS"
p1.font.size = Pt(14)
p1.font.bold = True
p1.font.color.rgb = GOLD
p2 = tf1.add_paragraph()
p2.text = "Current Deliverables (Month 6)"
p2.font.size = Pt(20)
p2.font.bold = True
p2.font.color.rgb = NAVY
p3 = tf1.add_paragraph()
p3.text = "Complete functional system operational with PDF ingestion, coordinate-anchored annotations, interactive master matrix, and live LaTeX export."
p3.font.size = Pt(16)
p3.font.color.rgb = DARK_TEXT

tb2 = s11.shapes.add_textbox(Inches(6.8), Inches(4.8), Inches(5.75), Inches(2.0))
tf2 = tb2.text_frame
tf2.word_wrap = True
tf2.margin_left = tf2.margin_right = tf2.margin_top = tf2.margin_bottom = 0
p1 = tf2.paragraphs[0]
p1.text = "MILESTONE 2: FUTURE TARGET"
p1.font.size = Pt(14)
p1.font.bold = True
p1.font.color.rgb = NAVY
p2 = tf2.add_paragraph()
p2.text = "Final Defense Deliverables (Month 12)"
p2.font.size = Pt(20)
p2.font.bold = True
p2.font.color.rgb = NAVY
p3 = tf2.add_paragraph()
p3.text = "Multi-user real-time PRISMA screening consensus engine, automated taxonomy clustering, empirical user study, and completed thesis dissertation."
p3.font.size = Pt(16)
p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 12: Section Breaker: 6-Month Progress Overview (White Theme)
# ==============================================================================
s12 = prs.slides.add_slide(blank_slide_layout)
set_slide_background_white(s12)

sec_pill = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(2.2), Inches(2.0), Inches(2.2), Inches(0.48))
sec_pill.fill.solid()
sec_pill.fill.fore_color.rgb = GOLD
sec_pill.line.fill.background()
p = sec_pill.text_frame.paragraphs[0]
p.text = "SECTION 02"
p.font.size = Pt(14)
p.font.bold = True
p.font.color.rgb = WHITE
p.alignment = PP_ALIGN.CENTER

div12 = s12.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(2.2), Inches(2.65), Inches(3.0), Inches(0.04))
div12.fill.solid()
div12.fill.fore_color.rgb = GOLD
div12.line.fill.background()

tb = s12.shapes.add_textbox(Inches(2.2), Inches(2.85), Inches(9.0), Inches(2.5))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "6-Month Progress Overview"
p.font.size = Pt(36)
p.font.bold = True
p.font.color.rgb = NAVY

p_sub = tf.add_paragraph()
p_sub.text = "Milestones Achieved, Core Deliverables, and Current System Status"
p_sub.font.size = Pt(20)
p_sub.font.bold = True
p_sub.font.color.rgb = SUB_TEXT

num_box = s12.shapes.add_textbox(Inches(11.0), Inches(7.05), Inches(1.5), Inches(0.35))
p_num = num_box.text_frame.paragraphs[0]
p_num.text = "12 / 28"
p_num.font.name = "Times New Roman"
p_num.font.size = Pt(14)
p_num.font.color.rgb = DARK_TEXT
p_num.alignment = PP_ALIGN.RIGHT

# ==============================================================================
# SLIDE 13: Progress Summary: Month 1 to 6
# ==============================================================================
s13 = prs.slides.add_slide(blank_slide_layout)
add_header(s13, "Progress Summary: Month 1 to 6", 13)

# Left: Progress Bars
tb_h = s13.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(6.0), Inches(0.45))
p = tb_h.text_frame.paragraphs[0]
p.text = "Phase-Wise Completion Status"
p.font.size = Pt(20)
p.font.bold = True
p.font.color.rgb = NAVY

bars = [
    ("Phase 1: Literature Review & SRS", 100, GREEN),
    ("Phase 2: Architecture & Database Design", 100, GREEN),
    ("Phase 3: Reviewer & Master Matrix Grid", 100, GREEN),
    ("Overall 12-Month Project Trajectory", 55, GOLD)
]

for idx, (lbl, pct, col) in enumerate(bars):
    top_pos = Inches(1.7 + idx * 1.0)
    
    tb_l = s13.shapes.add_textbox(Inches(0.8), top_pos, Inches(5.0), Inches(0.35))
    p = tb_l.text_frame.paragraphs[0]
    p.text = lbl
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = DARK_TEXT
    
    tb_p = s13.shapes.add_textbox(Inches(5.8), top_pos, Inches(1.0), Inches(0.35))
    p = tb_p.text_frame.paragraphs[0]
    p.text = f"{pct}%"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = col
    p.alignment = PP_ALIGN.RIGHT
    
    tr = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), top_pos + Inches(0.35), Inches(6.0), Inches(0.22))
    tr.fill.solid()
    tr.fill.fore_color.rgb = CARD_BORDER
    tr.line.fill.background()
    
    fill_w = Inches(6.0 * pct / 100.0)
    fi = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), top_pos + Inches(0.35), fill_w, Inches(0.22))
    fi.fill.solid()
    fi.fill.fore_color.rgb = col
    fi.line.fill.background()

# Right: Stat KPI Cards
tb_rh = s13.shapes.add_textbox(Inches(7.3), Inches(1.15), Inches(5.0), Inches(0.45))
p = tb_rh.text_frame.paragraphs[0]
p.text = "Key Metrics at Month 6"
p.font.size = Pt(20)
p.font.bold = True
p.font.color.rgb = NAVY

kpis = [
    (Inches(7.3), Inches(1.7), Inches(2.45), Inches(1.5), GREEN, "3 / 6", "Phases Completed"),
    (Inches(10.0), Inches(1.7), Inches(2.45), Inches(1.5), GOLD, "55%", "Overall Progress"),
    (Inches(7.3), Inches(3.4), Inches(2.45), Inches(1.5), BLUE, "12", "Core Modules Active"),
    (Inches(10.0), Inches(3.4), Inches(2.45), Inches(1.5), AMBER, "Phase 4", "Next Immediate Target")
]

for l, t, w, h, col, val, lbl in kpis:
    tb = s13.shapes.add_textbox(l, t + Inches(0.1), w, h - Inches(0.1))
    tf = tb.text_frame
    p1 = tf.paragraphs[0]
    p1.text = val
    p1.font.size = Pt(24)
    p1.font.bold = True
    p1.font.color.rgb = col
    p1.alignment = PP_ALIGN.CENTER
    
    p2 = tf.add_paragraph()
    p2.text = lbl
    p2.font.size = Pt(14)
    p2.font.bold = True
    p2.font.color.rgb = DARK_TEXT
    p2.alignment = PP_ALIGN.CENTER

# Bottom Assessment Box
tb = s13.shapes.add_textbox(Inches(0.8), Inches(6.05), Inches(11.733), Inches(0.8))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Executive Assessment: All preliminary research, system architecture, database modeling, and core functional implementation milestones for the first 6 months have been successfully executed according to the approved project plan."
p.font.size = Pt(16)
p.font.bold = True
p.font.color.rgb = NAVY
p.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 14: Completed Modules (Month 1 to 6)
# ==============================================================================
s14 = prs.slides.add_slide(blank_slide_layout)
add_header(s14, "Completed Modules (Month 1 to 6)", 14)

comp_mods = [
    (Inches(0.8), Inches(1.15), BLUE, "MODULE 01", "User Auth & Access Control",
     "Secure JWT session tokens, role-based route middleware, and bcrypt password encryption."),
    (Inches(4.8), Inches(1.15), GREEN, "MODULE 02", "Survey Initializer",
     "Multi-project creation, research protocol configuration, and inclusion criteria setup."),
    (Inches(8.8), Inches(1.15), AMBER, "MODULE 03", "PDF Ingestion Pipeline",
     "Drag-and-drop batch file ingestion, automatic BibTeX parsing, and metadata indexing."),
    (Inches(0.8), Inches(4.0), TEAL, "MODULE 04", "Dual-Pane PDF Reviewer",
     "Synchronous in-browser PDF reader docked beside dynamic variable extraction forms."),
    (Inches(4.8), Inches(4.0), GOLD, "MODULE 05", "Coordinate BBox Highlighting",
     "Geometric bounding box anchors bound to PDF coordinates for instant jump-to-quote."),
    (Inches(8.8), Inches(4.0), PURPLE, "MODULE 06", "Master Matrix & Export",
     "Live synthesis grid, inline cell editing, and 1-click LaTeX booktabs code output.")
]

for l, t, c, tag, tit, desc in comp_mods:
    tb = s14.shapes.add_textbox(l, t, Inches(3.75), Inches(2.7))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = tag
    p1.font.size = Pt(14)
    p1.font.bold = True
    p1.font.color.rgb = c
    p2 = tf.add_paragraph()
    p2.text = tit
    p2.font.size = Pt(20)
    p2.font.bold = True
    p2.font.color.rgb = NAVY
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.size = Pt(16)
    p3.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 15: Remaining Work (Month 7 to 12)
# ==============================================================================
s15 = prs.slides.add_slide(blank_slide_layout)
add_header(s15, "Remaining Work (Month 7 to 12)", 15)

tb_r1 = s15.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(5.75), Inches(4.8))
tf_r1 = tb_r1.text_frame
tf_r1.word_wrap = True
tf_r1.margin_left = tf_r1.margin_right = tf_r1.margin_top = tf_r1.margin_bottom = 0
p = tf_r1.paragraphs[0]
p.text = "MONTH 7–9: COLLABORATION & PRISMA"
p.font.size = Pt(14)
p.font.bold = True
p.font.color.rgb = AMBER

p_tit1 = tf_r1.add_paragraph()
p_tit1.text = "PRISMA Consensus & Validation"
p_tit1.font.size = Pt(20)
p_tit1.font.bold = True
p_tit1.font.color.rgb = NAVY

bullets_r1 = [
    ("Dual-Blind Screening Workflow: ", "Multi-reviewer independent vote recording without bias."),
    ("Cohen's Kappa (κ) Engine: ", "Automated inter-rater agreement computation and threshold alerts."),
    ("Supervisor Arbitration Panel: ", "Centralized dashboard for resolving reviewer inclusion discrepancies."),
    ("Automated Deduplication: ", "Title and DOI hash matching to eliminate redundant search imports.")
]
for b_t, b_d in bullets_r1:
    p = tf_r1.add_paragraph()
    p.text = "• " + b_t + b_d
    p.font.size = Pt(16)
    p.font.color.rgb = DARK_TEXT

tb_r2 = s15.shapes.add_textbox(Inches(6.8), Inches(1.15), Inches(5.75), Inches(4.8))
tf_r2 = tb_r2.text_frame
tf_r2.word_wrap = True
tf_r2.margin_left = tf_r2.margin_right = tf_r2.margin_top = tf_r2.margin_bottom = 0
p = tf_r2.paragraphs[0]
p.text = "MONTH 10–12: ANALYTICS & DEFENSE"
p.font.size = Pt(14)
p.font.bold = True
p.font.color.rgb = NAVY

p_tit2 = tf_r2.add_paragraph()
p_tit2.text = "Thematic Analytics & Final Dissertation"
p_tit2.font.size = Pt(20)
p_tit2.font.bold = True
p_tit2.font.color.rgb = NAVY

bullets_r2 = [
    ("Dynamic Thematic Clustering: ", "Automated categorization by methodology, problem domain, and dataset."),
    ("User Evaluation (SUS): ", "Comprehensive usability study with academic research groups (N ≥ 20)."),
    ("Security Hardening: ", "SQL injection audit, rate limiting, and automated backup routines."),
    ("Dissertation & Defense: ", "Final thesis documentation and formal defense preparation.")
]
for b_t, b_d in bullets_r2:
    p = tf_r2.add_paragraph()
    p.text = "• " + b_t + b_d
    p.font.size = Pt(16)
    p.font.color.rgb = DARK_TEXT

# Bottom Box
tb = s15.shapes.add_textbox(Inches(0.8), Inches(6.15), Inches(11.733), Inches(0.7))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "Target Outcome: A production-ready, peer-reviewed collaborative systematic literature review software system."
p.font.size = Pt(16)
p.font.bold = True
p.font.color.rgb = NAVY
p.alignment = PP_ALIGN.CENTER

# ==============================================================================
# SLIDE 16: System Design: Entity-Relationship Diagram (ERD)
# ==============================================================================
s16 = prs.slides.add_slide(blank_slide_layout)
add_header(s16, "System Design: Entity-Relationship Diagram", 16)

erd_img = os.path.join(FIGURES_DIR, "diagram_erd.png")
if os.path.exists(erd_img):
    s16.shapes.add_picture(erd_img, Inches(0.8), Inches(1.15), width=Inches(6.8))

tb = s16.shapes.add_textbox(Inches(7.8), Inches(1.15), Inches(4.7), Inches(5.6))
tf = tb.text_frame
tf.word_wrap = True
tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
p = tf.paragraphs[0]
p.text = "DATABASE ARCHITECTURE"
p.font.size = Pt(14)
p.font.bold = True
p.font.color.rgb = GREEN

p2 = tf.add_paragraph()
p2.text = "Relational Model & Integrity"
p2.font.size = Pt(20)
p2.font.bold = True
p2.font.color.rgb = NAVY

bullets_erd = [
    ("Core Entities: ", "Users, Projects, Papers, Annotations, MatrixRows, and ExtractionFields."),
    ("Relational Integrity: ", "Foreign keys with ON DELETE CASCADE prevent orphan records."),
    ("Coordinate Storage: ", "Precise bounding boxes stored as JSON-encoded geometric coordinates."),
    ("Concurrency Mode: ", "SQLite WAL enables high-frequency simultaneous reads and writes.")
]
for b_t, b_d in bullets_erd:
    p = tf.add_paragraph()
    p.text = "• " + b_t + b_d
    p.font.size = Pt(16)
    p.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 17: System Design: Use Case Diagram
# ==============================================================================
s17 = prs.slides.add_slide(blank_slide_layout)
add_header(s17, "System Design: Use Case Diagram", 17)

uc_img = os.path.join(FIGURES_DIR, "diagram_usecase.png")
if os.path.exists(uc_img):
    s17.shapes.add_picture(uc_img, Inches(0.8), Inches(1.15), width=Inches(6.8))

tb = s17.shapes.add_textbox(Inches(7.8), Inches(1.15), Inches(4.7), Inches(5.6))
tf = tb.text_frame
tf.word_wrap = True
tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
p = tf.paragraphs[0]
p.text = "WORKFLOW GOVERNANCE"
p.font.size = Pt(14)
p.font.bold = True
p.font.color.rgb = NAVY

p2 = tf.add_paragraph()
p2.text = "Actor & Role Workflows"
p2.font.size = Pt(20)
p2.font.bold = True
p2.font.color.rgb = NAVY

bullets_uc = [
    ("Primary Actors: ", "Researcher (Reviewer), Project Lead (Supervisor), and Admin."),
    ("Researcher Actions: ", "Ingest papers, highlight text coordinates, extract synthesis variables."),
    ("Project Lead Actions: ", "Define research questions, configure schemas, arbitrate conflicts."),
    ("Admin Actions: ", "Manage user accounts, role allocations, system audit logs, and backups.")
]
for b_t, b_d in bullets_uc:
    p = tf.add_paragraph()
    p.text = "• " + b_t + b_d
    p.font.size = Pt(16)
    p.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 18: Section Breaker: UI Screenshots & Live Demo
# ==============================================================================
s18 = prs.slides.add_slide(blank_slide_layout)
set_slide_background_white(s18)

add_card(s18, Inches(1.5), Inches(1.5), Inches(10.333), Inches(4.5), CARD_BG, CARD_BORDER)

sec_pill = s18.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(2.2), Inches(2.2), Inches(1.8), Inches(0.45))
sec_pill.fill.solid()
sec_pill.fill.fore_color.rgb = GOLD
sec_pill.line.fill.background()
p = sec_pill.text_frame.paragraphs[0]
p.text = "SECTION 03"
p.font.size = Pt(10)
p.font.bold = True
p.font.color.rgb = WHITE
p.alignment = PP_ALIGN.CENTER

div18 = s18.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(2.2), Inches(2.8), Inches(3.0), Inches(0.04))
div18.fill.solid()
div18.fill.fore_color.rgb = GOLD
div18.line.fill.background()

tb = s18.shapes.add_textbox(Inches(2.2), Inches(3.0), Inches(9.0), Inches(1.8))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "UI Implementation & Live Demo"
p.font.size = Pt(36)
p.font.bold = True
p.font.color.rgb = NAVY

p_sub = tf.add_paragraph()
p_sub.text = "Visual Inspection of the Fully Functional LitSphere System"
p_sub.font.size = Pt(15)
p_sub.font.color.rgb = SUB_TEXT

# Page number only
num_box = s18.shapes.add_textbox(Inches(11.0), Inches(7.05), Inches(1.5), Inches(0.35))
p_num = num_box.text_frame.paragraphs[0]
p_num.text = "18 / 28"
p_num.font.name = "Times New Roman"
p_num.font.size = Pt(14)
p_num.font.color.rgb = DARK_TEXT
p_num.alignment = PP_ALIGN.RIGHT

# ==============================================================================
# Helpers for Single-UI Slides (Slides 19 to 27)
# ==============================================================================
def add_single_ui_modal_slide(slide, title, s_num, img_name, badge, header, bullets):
    add_header(slide, title, s_num)
    
    img_path = os.path.join(FIGURES_DIR, img_name)
    if os.path.exists(img_path):
        slide.shapes.add_picture(img_path, Inches(0.8), Inches(1.15), width=Inches(5.3))
    
    tb = slide.shapes.add_textbox(Inches(6.4), Inches(1.15), Inches(6.1), Inches(5.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    
    p0 = tf.paragraphs[0]
    p0.text = badge
    p0.font.name = "Times New Roman"
    p0.font.size = Pt(14)  # sub text : 14
    p0.font.bold = True
    p0.font.color.rgb = SUB_TEXT
    
    p1 = tf.add_paragraph()
    p1.text = header
    p1.font.name = "Times New Roman"
    p1.font.size = Pt(20)  # Header : 20
    p1.font.bold = True
    p1.font.color.rgb = DARK_TEXT
    p1.space_after = Pt(10)
    
    for b_title, b_desc in bullets:
        p = tf.add_paragraph()
        p.text = f"• {b_title}: {b_desc}"
        p.font.name = "Times New Roman"
        p.font.size = Pt(16)  # Text : 16
        p.font.color.rgb = DARK_TEXT
        p.space_after = Pt(8)

def add_single_ui_wide_slide(slide, title, s_num, img_name, card1_badge, card1_title, card1_desc, card2_badge, card2_title, card2_desc):
    add_header(slide, title, s_num)
    
    img_path = os.path.join(FIGURES_DIR, img_name)
    if os.path.exists(img_path):
        slide.shapes.add_picture(img_path, Inches(0.8), Inches(1.05), width=Inches(11.733))
    
    top_pos = Inches(5.65)
    for col_left, b_badge, b_title, b_desc in [
        (Inches(0.8), card1_badge, card1_title, card1_desc),
        (Inches(6.8), card2_badge, card2_title, card2_desc)
    ]:
        tb = slide.shapes.add_textbox(col_left, top_pos, Inches(5.75), Inches(1.35))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        
        p0 = tf.paragraphs[0]
        p0.text = b_badge
        p0.font.name = "Times New Roman"
        p0.font.size = Pt(14)  # sub text : 14
        p0.font.bold = True
        p0.font.color.rgb = SUB_TEXT
        
        p1 = tf.add_paragraph()
        p1.text = b_title
        p1.font.name = "Times New Roman"
        p1.font.size = Pt(20)  # Header : 20
        p1.font.bold = True
        p1.font.color.rgb = DARK_TEXT
        
        p2 = tf.add_paragraph()
        p2.text = b_desc
        p2.font.name = "Times New Roman"
        p2.font.size = Pt(16)  # Text : 16
        p2.font.color.rgb = DARK_TEXT

# ==============================================================================
# SLIDE 19: UI Authentication & Session Login
# ==============================================================================
s19 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_modal_slide(
    s19, "UI: User Authentication & Session Login", 19,
    "ui_01_login.png", "AUTHENTICATION LAYER", "Single-Sign-On & Session Security",
    [
        ("Regex Input Validation", "Instant client-side format checks for academic email addresses and password security."),
        ("JWT Bearer Generation", "Issues cryptographically signed stateless tokens upon successful credential verification."),
        ("Bcrypt Hashing", "High-entropy password encryption protecting user accounts from brute-force vectors."),
        ("Persistent Session State", "Secure local credential caching for seamless navigation across literature workspace tabs.")
    ]
)

# ==============================================================================
# SLIDE 20: UI Researcher Registration & Account Setup
# ==============================================================================
s20 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_modal_slide(
    s20, "UI: Researcher Registration & Account Setup", 20,
    "ui_02_create_account.png", "USER ONBOARDING", "Institutional Registration & Role Assignment",
    [
        ("Academic Profile Capture", "Records researcher full name, department, and university affiliation during signup."),
        ("Role-Based Governance", "Grants initial access tiers (Student Researcher, Reviewer, or Principal Investigator)."),
        ("Password Policy Enforcement", "Multi-condition character validation ensures robust credential security."),
        ("Immediate Workspace Access", "Direct transition into systematic literature review projects without manual activation lag.")
    ]
)

# ==============================================================================
# SLIDE 21: UI Researcher Profile & Institutional Affiliation
# ==============================================================================
s21 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s21, "UI: Researcher Profile & Institutional Affiliation", 21,
    "ui_03_user_profile.png",
    "ROLE GOVERNANCE", "Account Credentials & Access Roles",
    "Displays active identity credentials, institutional department metadata, and user privileges across all assigned review teams.",
    "ACTIVITY TELEMETRY", "Project Memberships & Contributions",
    "Monitors active literature survey projects, tracks individual paper extraction tallies, and manages password updates."
)

# ==============================================================================
# SLIDE 22: UI Central Project Dashboard & Review Metrics
# ==============================================================================
s22 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s22, "UI: Project Dashboard & Review Metrics", 22,
    "ui_04_dashboard.png",
    "EXECUTIVE METRICS", "Survey Portfolio & Extraction KPIs",
    "Real-time operational dashboard providing high-level progress tracking, paper ingestion counts, and variable extraction status.",
    "WORKFLOW ACTIONS", "Protocol Launch & Batch Ingestion",
    "One-click shortcuts to initiate new PRISMA literature review protocols, import BibTeX bibliographic libraries, and add collaborators."
)

# ==============================================================================
# SLIDE 23: UI Survey Project Workspace & Paper Ingestion
# ==============================================================================
s23 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s23, "UI: Survey Workspace & Literature Ingestion", 23,
    "ui_05_workspace.png",
    "INGESTION PIPELINE", "Drag-and-Drop Batch File Upload",
    "High-throughput multi-file PDF ingestion interface with automated bibliographic parsing, title hashing, and metadata normalization.",
    "LITERATURE CATALOG", "Status Filtering & Review Queue",
    "Organized research repository featuring status pills (Uploaded, In Progress, Synthesized) and multi-field keyword filtering."
)

# ==============================================================================
# SLIDE 24: UI Split-Screen Dual-Pane Paper Reviewer
# ==============================================================================
s24 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s24, "UI: Split-Screen Dual-Pane Paper Reviewer", 24,
    "ui_06_reviewer.png",
    "DUAL-PANE WORKSPACE", "Synchronous In-Browser PDF Reading",
    "Integrated PDF reader docked side-by-side with extraction inputs, eliminating workflow disruption from external desktop viewers.",
    "COORDINATE ANCHORING", "Geometric BBox Text Highlighting",
    "Text selections capture exact normalized bounding-box coordinates, providing direct jump-to-quote verification in under 2 seconds."
)

# ==============================================================================
# SLIDE 25: UI Interactive Master Synthesis Matrix Grid
# ==============================================================================
s25 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s25, "UI: Interactive Master Synthesis Matrix Grid", 25,
    "ui_07_matrix.png",
    "CROSS-STUDY SYNTHESIS", "Consolidated Comparative Grid",
    "Multi-dimensional tabular matrix harmonizing extracted variables (methodology, datasets, metrics, limitations) across all papers.",
    "TRANSACTIONAL EXPORT", "Inline Editing & 1-Click LaTeX",
    "Supports real-time inline updates with ACID database guarantees, plus direct 1-click export to publication-ready LaTeX booktabs code."
)

# ==============================================================================
# SLIDE 26: UI Thematic Clustering & Synthesis Taxonomy
# ==============================================================================
s26 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s26, "UI: Thematic Clustering & Synthesis Taxonomy", 26,
    "ui_08_cluster_summary.png",
    "TAXONOMY DISCOVERY", "Algorithmic Research Grouping",
    "Automated thematic clustering categorizing ingested literature into distinct methodological paradigms, architectures, and focus domains.",
    "SYNTHESIS ANALYTICS", "Comparative Paradigm Distributions",
    "Visual analytics displaying literature density, benchmark trends, and research frequency across surveyed publications."
)

# ==============================================================================
# SLIDE 27: UI Benchmark Sample Analysis & Cluster Details
# ==============================================================================
s27 = prs.slides.add_slide(blank_slide_layout)
add_single_ui_wide_slide(
    s27, "UI: Benchmark Sample & Cluster Details", 27,
    "ui_09_cluster_sample.png",
    "GRANULAR DRILLDOWN", "Benchmark Sample Breakdown",
    "Deep-dive inspection panel displaying constituent papers within a cluster, comparing evaluation metrics and algorithmic models.",
    "RESEARCH GAP IDENTIFICATION", "Cross-Methodology Discrepancies",
    "Reveals performance discrepancies, benchmark dataset limitations, and unexplored research gaps across competitive methodologies."
)

# ==============================================================================
# SLIDE 28: Conclusion & Project Outlook
# ==============================================================================
s28 = prs.slides.add_slide(blank_slide_layout)
add_header(s28, "Conclusion & Project Outlook", 28)

conc_cards = [
    (Inches(0.8), Inches(1.15), GREEN, "ACHIEVEMENTS", "Phases 1–3 Complete",
     "• End-to-end working system.\n• Dual-pane PDF reviewer.\n• Coordinate BBox anchoring.\n• Live master matrix grid.\n• Native LaTeX export."),
    (Inches(4.8), Inches(1.15), GOLD, "STATUS", "Current Milestone (M6)",
     "• 55% roadmap executed.\n• Zero major blockers.\n• High UX performance.\n• Proven architectural scale.\n• On track for M12 defense."),
    (Inches(8.8), Inches(1.15), NAVY, "NEXT STEPS", "Months 7 to 12 Focus",
     "• Collaborative PRISMA voting.\n• Cohen's Kappa score engine.\n• Supervisor conflict resolver.\n• SUS usability evaluation.\n• Final thesis dissertation.")
]

for l, t, c, tag, tit, desc in conc_cards:
    tb = s28.shapes.add_textbox(l, t, Inches(3.75), Inches(5.6))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.text = tag
    p.font.name = "Times New Roman"
    p.font.size = Pt(14)  # sub text : 14
    p.font.bold = True
    p.font.color.rgb = c
    p = tf.add_paragraph()
    p.text = tit
    p.font.name = "Times New Roman"
    p.font.size = Pt(20)  # Header : 20
    p.font.bold = True
    p.font.color.rgb = NAVY
    p = tf.add_paragraph()
    p.text = desc
    p.font.name = "Times New Roman"
    p.font.size = Pt(16)  # Text : 16
    p.font.color.rgb = DARK_TEXT

# --- Universal Font Pass: Enforce Times New Roman Across ALL Text in PPTX ---
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for paragraph in shape.text_frame.paragraphs:
                paragraph.font.name = "Times New Roman"
                for run in paragraph.runs:
                    run.font.name = "Times New Roman"
        elif shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    for paragraph in cell.text_frame.paragraphs:
                        paragraph.font.name = "Times New Roman"
                        for run in paragraph.runs:
                            run.font.name = "Times New Roman"

# Save presentation
prs.save(OUTPUT_PPTX)
print(f"Successfully generated 28-slide White Theme PPTX with Times New Roman at: {OUTPUT_PPTX}")
