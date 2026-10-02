"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { isMediaFile, uploadMediaFile } from "@/components/flow-canvas/media-picker";
import { MANYCHAT, nodeHex } from "@/components/flow-canvas/node-colors";
import {
  NodeInspector,
  type FlowMeta,
  type InspectorField,
  type InspectorFlowOption,
} from "@/components/flow-canvas/node-inspector";
import { NodePalette } from "@/components/flow-canvas/node-palette";
import { flowNodeTypes } from "@/components/flow-canvas/nodes";
import {
  TRIGGER_NODE_ID,
  canvasEdgeLabel,
  canvasToDefinition,
  createCanvasNode,
  definitionToCanvas,
  isMediaBlock,
  isValidCanvasConnection,
  mediaBlockTypeFor,
  messageNodeButtons,
  newBlockId,
  newStepId,
  replaceHandleEdge,
  validateCanvas,
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeKind,
  type CanvasValidation,
  type ChannelLimits,
} from "@/lib/flow-canvas";
import { classifyMedia } from "@/lib/media-kinds";
import type { FlowDefinition } from "@/lib/types";

export type FlowCanvasHandle = {
  getDefinition: () => FlowDefinition;
  getValidation: () => ReturnType<typeof validateCanvas>;
};

type RfNode = Node<CanvasNodeData, CanvasNodeKind>;

const defaultEdgeOptions: Partial<Edge> = {
  type: "smoothstep",
  style: { strokeWidth: 1.75, stroke: MANYCHAT.line },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: MANYCHAT.line,
  },
};

function toRf(graph: ReturnType<typeof definitionToCanvas>): { nodes: RfNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      deletable: node.id !== TRIGGER_NODE_ID,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: canvasEdgeLabel(graph.nodes, edge),
      ...defaultEdgeOptions,
    })),
  };
}

function fromRf(nodes: RfNode[], edges: Edge[]): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type ?? "message") as CanvasNodeKind,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? "out",
      targetHandle: edge.targetHandle ?? "in",
    })),
  };
}

function CanvasStage({
  initialDefinition,
  channelLimits,
  meta,
  customFields,
  tagNames,
  otherFlows,
  onMetaChange,
  onValidationChange,
  canvasRef,
}: {
  initialDefinition: FlowDefinition;
  /** Platform limits (buttons, quick replies) used for channel-specific warnings. */
  channelLimits?: ChannelLimits;
  meta: FlowMeta;
  customFields: InspectorField[];
  tagNames: string[];
  otherFlows: InspectorFlowOption[];
  onMetaChange: (patch: Partial<FlowMeta>) => void;
  onValidationChange?: (validation: CanvasValidation) => void;
  canvasRef: React.Ref<FlowCanvasHandle>;
}) {
  const seed = useMemo(() => toRf(definitionToCanvas(initialDefinition)), [initialDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges);
  const [selectedId, setSelectedId] = useState<string | null>(TRIGGER_NODE_ID);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useCallback(() => fromRf(nodes, edges), [nodes, edges]);

  // Undo / redo: snapshots of the graph (positions, data, edges), taken once edits settle.
  const history = useRef<{ past: string[]; future: string[]; current: string; restoring: boolean }>({
    past: [],
    future: [],
    current: "",
    restoring: false,
  });
  useEffect(() => {
    const snapshot = JSON.stringify(fromRf(nodes, edges));
    const state = history.current;
    if (!state.current) {
      state.current = snapshot;
      return;
    }
    // An undo/redo just applied this graph: take it as the current state, not as a new edit.
    if (state.restoring) {
      state.restoring = false;
      state.current = snapshot;
      return;
    }
    if (snapshot === state.current) return;
    const timer = setTimeout(() => {
      if (snapshot === state.current) return;
      state.past = [...state.past, state.current].slice(-50);
      state.future = [];
      state.current = snapshot;
    }, 350);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const restore = useCallback(
    (direction: "undo" | "redo") => {
      const state = history.current;
      const from = direction === "undo" ? state.past : state.future;
      const target = from[from.length - 1];
      if (!target) return;
      if (direction === "undo") {
        state.past = state.past.slice(0, -1);
        state.future = [...state.future, state.current];
      } else {
        state.future = state.future.slice(0, -1);
        state.past = [...state.past, state.current];
      }
      state.current = target;
      state.restoring = true;
      const rf = toRf(JSON.parse(target) as CanvasGraph);
      setNodes(rf.nodes);
      setEdges(rf.edges);
    },
    [setNodes, setEdges],
  );

  // Copy / paste a step (not the trigger): pasted with a new id, slightly offset, unconnected.
  const clipboard = useRef<RfNode | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        restore(event.shiftKey ? "redo" : "undo");
      } else if (key === "y") {
        event.preventDefault();
        restore("redo");
      } else if (key === "c") {
        const node = nodes.find((item) => item.id === selectedId);
        if (node && node.id !== TRIGGER_NODE_ID) clipboard.current = node;
      } else if (key === "v" && clipboard.current) {
        event.preventDefault();
        const source = clipboard.current;
        const id = newStepId();
        setNodes((current) => [
          ...current.map((node) => ({ ...node, selected: false })),
          { ...source, id, selected: true, position: { x: source.position.x + 40, y: source.position.y + 40 }, data: structuredClone(source.data) },
        ]);
        setSelectedId(id);
        clipboard.current = { ...source, position: { x: source.position.x + 40, y: source.position.y + 40 } };
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodes, selectedId, restore, setNodes]);

  useImperativeHandle(
    canvasRef,
    () => ({
      getDefinition: () => canvasToDefinition(graph()),
      getValidation: () => validateCanvas(graph(), channelLimits),
    }),
    [graph],
  );

  useEffect(() => {
    onValidationChange?.(validateCanvas(graph(), channelLimits));
  }, [graph, onValidationChange, channelLimits]);

  const labeledEdges = useMemo(() => {
    const mapped = fromRf(nodes, edges);
    return edges.map((edge) => ({
      ...edge,
      ...defaultEdgeOptions,
      label: canvasEdgeLabel(mapped.nodes, {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? "out",
        targetHandle: edge.targetHandle ?? "in",
      }),
    }));
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidCanvasConnection(connection) || !connection.source || !connection.target) return;
      setEdges((current) => {
        const mapped = current.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? "out",
          targetHandle: edge.targetHandle ?? "in",
        }));
        return replaceHandleEdge(mapped, {
          source: connection.source!,
          target: connection.target!,
          sourceHandle: connection.sourceHandle ?? "next",
          targetHandle: connection.targetHandle ?? "in",
        });
      });
    },
    [setEdges],
  );

  const addNode = useCallback(
    (kind: Exclude<CanvasNodeKind, "trigger">, position?: { x: number; y: number }) => {
      const created = createCanvasNode(
        kind,
        position ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
      );
      const node: RfNode = {
        id: created.id,
        type: created.type,
        position: created.position,
        data: created.data,
      };
      setNodes((current) => [...current, node]);
      setSelectedId(created.id);
      return created.id;
    },
    [screenToFlowPosition, setNodes],
  );

  const attachFileAt = useCallback(
    async (file: File, position: { x: number; y: number }) => {
      const id = addNode("send_message", position);
      setNodes((current) =>
        current.map((node) =>
          node.id === id && node.data.kind === "send_message"
            ? {
                ...node,
                data: {
                  ...node.data,
                  blocks: [{ id: newBlockId(), type: mediaBlockTypeFor(classifyMedia(file.type, file.name)), text: "", buttons: [] }],
                },
              }
            : node,
        ),
      );
      try {
        const media = await uploadMediaFile(file);
        setNodes((current) =>
          current.map((node) =>
            node.id === id && node.data.kind === "send_message"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    blocks: node.data.blocks.map((block) =>
                      isMediaBlock(block) ? { ...block, type: mediaBlockTypeFor(media.kind), media } : block,
                    ),
                  },
                }
              : node,
          ),
        );
        toast.success(media.kind === "animation" ? "GIF node added" : "Image node added");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
    },
    [addNode, setNodes],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const file = [...event.dataTransfer.files].find(isMediaFile);
      if (file) {
        void attachFileAt(file, position);
        return;
      }
      const kind = event.dataTransfer.getData("application/relay-node") as Exclude<
        CanvasNodeKind,
        "trigger"
      >;
      if (!kind) return;
      addNode(kind, position);
    },
    [addNode, attachFileAt, screenToFlowPosition],
  );

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const onDataChange = (id: string, data: CanvasNodeData) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, data } : node)));
    if (data.kind === "buttons") {
      const handles = new Set(data.buttons.filter((button) => !button.url).map((button) => button.id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== id || !edge.sourceHandle?.startsWith("btn-") || handles.has(edge.sourceHandle)),
      );
    }
    if (data.kind === "gallery") {
      const handles = new Set<string>([
        "next",
        ...data.cards.flatMap((card) => card.buttons).filter((button) => !button.url).map((button) => button.id),
      ]);
      setEdges((current) => current.filter((edge) => edge.source !== id || handles.has(edge.sourceHandle ?? "")));
    }
    if (data.kind === "send_message") {
      const handles = new Set<string>([
        "next",
        ...messageNodeButtons(data)
          .filter((button) => !button.url)
          .map((button) => button.id),
        ...data.quickReplies.map((reply) => reply.id),
      ]);
      setEdges((current) => current.filter((edge) => edge.source !== id || handles.has(edge.sourceHandle ?? "")));
    }
  };

  const onDelete = (id: string) => {
    if (id === TRIGGER_NODE_ID) return;
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(TRIGGER_NODE_ID);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <NodePalette onAdd={(kind) => addNode(kind)} />
      <div className="relative min-h-[52vh] min-w-0 flex-1 md:min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={labeledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          nodeTypes={flowNodeTypes}
          onSelectionChange={({ nodes: selectedNodes }) => {
            setSelectedId(selectedNodes[0]?.id ?? null);
          }}
          isValidConnection={isValidCanvasConnection}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineType={ConnectionLineType.SmoothStep}
          snapToGrid
          snapGrid={[16, 16]}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          deleteKeyCode={["Backspace", "Delete"]}
          onBeforeDelete={async ({ nodes: pending, edges: pendingEdges }) => {
            const keep = pending.filter((node) => node.id !== TRIGGER_NODE_ID);
            if (keep.length === 0) return false;
            return { nodes: keep, edges: pendingEdges };
          }}
          proOptions={{ hideAttribution: true }}
          className="relay-flow"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#D0D5DD" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!shadow-none"
            style={{ background: MANYCHAT.canvas }}
            nodeColor={(node) => nodeHex(node.type)}
          />
        </ReactFlow>
      </div>
      <NodeInspector
        selectedId={selected?.id ?? selectedId}
        data={selected?.data ?? null}
        meta={meta}
        customFields={customFields}
        tagNames={tagNames}
        otherFlows={otherFlows}
        onMetaChange={onMetaChange}
        onDataChange={onDataChange}
        onDelete={onDelete}
      />
    </div>
  );
}

export const FlowCanvasEditor = forwardRef<
  FlowCanvasHandle,
  {
    initialDefinition: FlowDefinition;
  /** Platform limits (buttons, quick replies) used for channel-specific warnings. */
  channelLimits?: ChannelLimits;
    meta: FlowMeta;
    customFields: InspectorField[];
    tagNames: string[];
    otherFlows: InspectorFlowOption[];
    onMetaChange: (patch: Partial<FlowMeta>) => void;
    onValidationChange?: (validation: CanvasValidation) => void;
  }
>(function FlowCanvasEditor(props, ref) {
  return (
    <ReactFlowProvider>
      <CanvasStage {...props} canvasRef={ref} />
    </ReactFlowProvider>
  );
});

export default FlowCanvasEditor;
