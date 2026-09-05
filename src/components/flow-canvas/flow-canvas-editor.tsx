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
  useState,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import { isImageFile, uploadMediaFile } from "@/components/flow-canvas/media-picker";
import { nodeHex } from "@/components/flow-canvas/node-colors";
import { NodeInspector, type FlowMeta, type InspectorField } from "@/components/flow-canvas/node-inspector";
import { NodePalette } from "@/components/flow-canvas/node-palette";
import { flowNodeTypes } from "@/components/flow-canvas/nodes";
import {
  TRIGGER_NODE_ID,
  canvasEdgeLabel,
  canvasToDefinition,
  createCanvasNode,
  definitionToCanvas,
  isValidCanvasConnection,
  replaceHandleEdge,
  validateCanvas,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeKind,
  type CanvasValidation,
} from "@/lib/flow-canvas";
import type { FlowDefinition } from "@/lib/types";

export type FlowCanvasHandle = {
  getDefinition: () => FlowDefinition;
  getValidation: () => ReturnType<typeof validateCanvas>;
};

type RfNode = Node<CanvasNodeData, CanvasNodeKind>;

const defaultEdgeOptions: Partial<Edge> = {
  type: "smoothstep",
  style: { strokeWidth: 1.75 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "var(--xy-edge-stroke-default)",
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
  meta,
  customFields,
  tagNames,
  onMetaChange,
  onValidationChange,
  canvasRef,
}: {
  initialDefinition: FlowDefinition;
  meta: FlowMeta;
  customFields: InspectorField[];
  tagNames: string[];
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

  useImperativeHandle(
    canvasRef,
    () => ({
      getDefinition: () => canvasToDefinition(graph()),
      getValidation: () => validateCanvas(graph()),
    }),
    [graph],
  );

  useEffect(() => {
    onValidationChange?.(validateCanvas(graph()));
  }, [graph, onValidationChange]);

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
      const id = addNode("media", position);
      try {
        const media = await uploadMediaFile(file);
        setNodes((current) =>
          current.map((node) =>
            node.id === id && (node.data.kind === "media" || node.data.kind === "message")
              ? { ...node, data: { ...node.data, media } }
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
      const file = [...event.dataTransfer.files].find(isImageFile);
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
      const handles = new Set(data.buttons.map((button) => button.id));
      setEdges((current) =>
        current.filter((edge) => edge.source !== id || !edge.sourceHandle?.startsWith("btn-") || handles.has(edge.sourceHandle)),
      );
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
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!bg-card !shadow-none"
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
    meta: FlowMeta;
    customFields: InspectorField[];
    tagNames: string[];
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
