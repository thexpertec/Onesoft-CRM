import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Minus,
  Undo2,
  Redo2,
  Highlighter,
  Link2,
  Link2Off,
  RemoveFormatting,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
  Merge,
  Split,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-0.5 flex-shrink-0" />;
}

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Type your detailed notes here...",
  minHeight = "320px",
}: RichTextEditorProps) {
  const [showTableMenu, setShowTableMenu] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline cursor-pointer" },
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "",
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `w-full px-4 py-4 text-sm text-foreground leading-relaxed focus:outline-none`,
        style: `min-height: ${minHeight}`,
      },
    },
  });

  const lastSyncedValue = useRef(value || "");
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    const editorHtml = editor.getHTML();
    if (incoming !== lastSyncedValue.current && incoming !== editorHtml) {
      lastSyncedValue.current = incoming;
      editor.commands.setContent(incoming, false as never);
    }
  }, [editor, value]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    setShowTableMenu(false);
  };

  const inTable = editor.isActive("table");

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-background/95 backdrop-blur-sm rounded-t-xl">
        {/* Undo / Redo */}
        <ToolbarButton
          title="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Redo (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo2 size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Inline formatting */}
        <ToolbarButton
          title="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Highlight"
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Inline Code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text color */}
        <label title="Text Color" className="relative p-1.5 rounded cursor-pointer hover:bg-muted transition-colors">
          <span className="text-xs font-bold text-foreground leading-none" style={{ fontFamily: "serif" }}>A</span>
          <input
            type="color"
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            title="Text Color"
          />
          <div
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
            style={{ backgroundColor: editor.getAttributes("textStyle").color ?? "#1d4ed8" }}
          />
        </label>

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          title="Bullet List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Alignment */}
        <ToolbarButton
          title="Align Left"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align Center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Align Right"
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Justify"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Link */}
        <ToolbarButton
          title="Add / Edit Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <Link2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Remove Link"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
        >
          <Link2Off size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Horizontal rule */}
        <ToolbarButton
          title="Horizontal Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={14} />
        </ToolbarButton>

        {/* Clear formatting */}
        <ToolbarButton
          title="Clear Formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Table controls */}
        <div className="relative">
          <ToolbarButton
            title="Table"
            active={inTable || showTableMenu}
            onClick={() => setShowTableMenu((v) => !v)}
          >
            <TableIcon size={14} />
          </ToolbarButton>
          {showTableMenu && (
            <div
              className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 flex flex-col gap-1 min-w-[190px]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                type="button"
                onClick={insertTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full"
              >
                <TableIcon size={12} /> Insert 3×3 table
              </button>
              <div className="h-px bg-border my-0.5" />
              <button
                type="button"
                onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <ChevronUp size={12} /> Add row above
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <ChevronDown size={12} /> Add row below
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <Rows3 size={12} /> Delete row
              </button>
              <div className="h-px bg-border my-0.5" />
              <button
                type="button"
                onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <ChevronLeft size={12} /> Add column left
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <ChevronRight size={12} /> Add column right
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <Columns3 size={12} /> Delete column
              </button>
              <div className="h-px bg-border my-0.5" />
              <button
                type="button"
                onClick={() => { editor.chain().focus().mergeCells().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <Merge size={12} /> Merge cells
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().splitCell().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <Split size={12} /> Split cell
              </button>
              <button
                type="button"
                onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full disabled:opacity-40"
              >
                <Rows3 size={12} /> Toggle header row
              </button>
              <div className="h-px bg-border my-0.5" />
              <button
                type="button"
                onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }}
                disabled={!inTable}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted text-left w-full text-destructive disabled:opacity-40"
              >
                <Trash2 size={12} /> Delete table
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div onClick={() => setShowTableMenu(false)}>
        <EditorContent editor={editor} />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-end px-4 py-1.5 border-t border-border/60 bg-muted/20 rounded-b-xl">
        <span className="text-xs text-muted-foreground/50">
          {editor.getText().trim().length > 0
            ? `${editor.getText().trim().split(/\s+/).filter(Boolean).length} words · ${editor.getText().trim().length.toLocaleString()} characters`
            : "Start typing..."}
        </span>
      </div>
    </div>
  );
}
